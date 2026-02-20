# pip install cairo-lang
from starkware.starknet.public.abi import starknet_keccak

# This is the interface
base_account = [
    '__execute__(Array<(ContractAddress,felt252,Array<felt252>)>)->Array<(@Array<felt252>)>',
    '__validate__(Array<(ContractAddress,felt252,Array<felt252>)>)->felt252',
]

account = [
    '__execute__(Array<(ContractAddress,felt252,Array<felt252>)>)->Array<(@Array<felt252>)>',
    '__validate__(Array<(ContractAddress,felt252,Array<felt252>)>)->felt252',
    '__validate_declare__(felt252)->felt252',
    'is_valid_signature(felt252,Array<felt252>)->u32',
    'supports_interface(felt252)->E((),())',
]

declarer = [
    '__validate_declare__(felt252)->felt252'
]

erc721 = [
    "balance_of(ContractAddress)->(u128,u128)",
    "owner_of((u128,u128))->ContractAddress",
    "transfer_from(ContractAddress,ContractAddress,(u128,u128))",
    "safe_transfer_from(ContractAddress,ContractAddress,(u128,u128),(@Array<felt252>))",
    "approve(ContractAddress,(u128,u128))",
    "set_approval_for_all(ContractAddress,E((),()))",
    "get_approved((u128,u128))->ContractAddress",
    "is_approved_for_all(ContractAddress,ContractAddress)->E((),())",
]

erc721_metadata = [
    "name()->felt252",
    "symbol()->felt252",
    "token_uri((u128,u128))->felt252",
]

erc721_receiver = [
    "on_erc721_received(ContractAddress,ContractAddress,(u128,u128),(@Array<felt252>))->felt252",
]

access_control = [
    "has_role(felt252,ContractAddress)->E((),())",
    "get_role_admin(felt252)->felt252",
    "grant_role(felt252,ContractAddress)",
    "revoke_role(felt252,ContractAddress)",
    "renounce_role(felt252,ContractAddress)"
]

erc1271 = [
    'is_valid_signature(felt252,Array<felt252>)->felt252',
]

src5 = [
    'onERC721Received',
]

def main():
    interface_id = starknet_keccak("\"VoteWithReasonAndParams\"(\"verifying_contract\":\"ContractAddress\",\"nonce\":\"felt\",\"proposal_id\":\"felt\",\"support\":\"u128\",\"voter\":\"ContractAddress\",\"reason_hash\":\"felt\",\"params\":\"felt*\")".encode())
    print('IAccount ID:')
    print(hex(interface_id))


if __name__ == "__main__":
    main()