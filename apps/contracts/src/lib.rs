#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, String,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Escrow(String), // Key is invoice_id
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowState {
    pub sender: Address,
    pub token: Address,
    pub amount: i128,
    pub status: u32, // 1 = LOCKED, 2 = RELEASED, 3 = REFUNDED
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    EscrowNotFound = 4,
    EscrowNotLocked = 5,
    InvalidAmount = 6,
}

#[contract]
pub struct LintasEscrow;

#[contractimpl]
impl LintasEscrow {
    // Initialize the contract, setting the Lintas bridge address as admin
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(100, 518400);
        Ok(())
    }

    // Lock funds from a buyer for a specific QRIS invoice
    pub fn lock_funds(
        env: Env,
        sender: Address,
        token: Address,
        amount: i128,
        invoice_id: String,
    ) -> Result<(), Error> {
        sender.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Escrow(invoice_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyInitialized);
        }

        // Transfer funds from sender to this escrow contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        let state = EscrowState {
            sender: sender.clone(),
            token: token.clone(),
            amount,
            status: 1, // LOCKED
        };

        env.storage().persistent().set(&key, &state);
        env.storage().persistent().extend_ttl(&key, 100, 518400);

        // Emit Lock Event
        env.events().publish(
            (soroban_sdk::symbol_short!("lock"), invoice_id),
            (sender, token, amount),
        );

        Ok(())
    }

    // Release locked funds to the Lintas bridge admin (called upon successful payout verification)
    pub fn release_funds(env: Env, invoice_id: String) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let key = DataKey::Escrow(invoice_id.clone());
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::EscrowNotFound)?;

        if state.status != 1 {
            return Err(Error::EscrowNotLocked);
        }

        // Transfer the locked funds to the admin (bridge wallet)
        let token_client = token::Client::new(&env, &state.token);
        token_client.transfer(&env.current_contract_address(), &admin, &state.amount);

        state.status = 2; // RELEASED
        env.storage().persistent().set(&key, &state);

        // Emit Release Event
        env.events().publish(
            (soroban_sdk::symbol_short!("release"), invoice_id),
            (admin, state.token, state.amount),
        );

        Ok(())
    }

    // Refund locked funds back to the original buyer (called on payment failure or timeout)
    pub fn refund_funds(env: Env, refunder: Address, invoice_id: String) -> Result<(), Error> {
        refunder.require_auth();

        let key = DataKey::Escrow(invoice_id.clone());
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::EscrowNotFound)?;

        if state.status != 1 {
            return Err(Error::EscrowNotLocked);
        }

        // Authenticate call: Either the admin (bridge) or the original sender can trigger the refund
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;

        if refunder != admin && refunder != state.sender {
            return Err(Error::Unauthorized);
        }

        // Transfer the locked funds back to the buyer
        let token_client = token::Client::new(&env, &state.token);
        token_client.transfer(&env.current_contract_address(), &state.sender, &state.amount);

        state.status = 3; // REFUNDED
        env.storage().persistent().set(&key, &state);

        // Emit Refund Event
        env.events().publish(
            (soroban_sdk::symbol_short!("refund"), invoice_id),
            (state.sender, state.token, state.amount),
        );

        Ok(())
    }

    // Fetch the current state of an escrow
    pub fn get_escrow(env: Env, invoice_id: String) -> Option<EscrowState> {
        let key = DataKey::Escrow(invoice_id);
        env.storage().persistent().get(&key)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_escrow_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);

        // Deploy LintasEscrow contract
        let contract_id = env.register(LintasEscrow, ());
        let client = LintasEscrowClient::new(&env, &contract_id);

        // Initialize contract
        client.initialize(&admin);

        // Create a mock token
        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(token_admin);
        let token_client = token::StellarAssetClient::new(&env, &token_id);
        let token_query = token::Client::new(&env, &token_id);

        // Mint token to buyer
        token_client.mint(&buyer, &1000);
        assert_eq!(token_query.balance(&buyer), 1000);

        // Lock funds
        let invoice_id = String::from_str(&env, "inv_123");
        client.lock_funds(&buyer, &token_id, &300, &invoice_id);

        // Verify escrow status is locked and balances updated
        let escrow = client.get_escrow(&invoice_id).unwrap();
        assert_eq!(escrow.amount, 300);
        assert_eq!(escrow.status, 1); // LOCKED
        assert_eq!(token_query.balance(&buyer), 700);
        assert_eq!(token_query.balance(&contract_id), 300);

        // Release funds to admin (bridge)
        client.release_funds(&invoice_id);
        let escrow_after = client.get_escrow(&invoice_id).unwrap();
        assert_eq!(escrow_after.status, 2); // RELEASED
        assert_eq!(token_query.balance(&contract_id), 0);
        assert_eq!(token_query.balance(&admin), 300);
    }

    #[test]
    fn test_refund_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);

        let contract_id = env.register(LintasEscrow, ());
        let client = LintasEscrowClient::new(&env, &contract_id);

        client.initialize(&admin);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(token_admin);
        let token_client = token::StellarAssetClient::new(&env, &token_id);
        let token_query = token::Client::new(&env, &token_id);

        token_client.mint(&buyer, &1000);

        let invoice_id = String::from_str(&env, "inv_123");
        client.lock_funds(&buyer, &token_id, &400, &invoice_id);

        // Refund funds back to buyer
        client.refund_funds(&buyer, &invoice_id);
        let escrow = client.get_escrow(&invoice_id).unwrap();
        assert_eq!(escrow.status, 3); // REFUNDED
        assert_eq!(token_query.balance(&buyer), 1000);
        assert_eq!(token_query.balance(&contract_id), 0);
    }
}
