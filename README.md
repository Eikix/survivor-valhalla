# Survivor Valhalla

A beast lineup management system on Starknet using the Dojo framework.

## Contract Endpoints

### World Contract
- **Address**: `0x01c549354a5324cf3a978f89eb60566b251740d85dada78a6f85246fe5684f96`
- **Network**: Starknet Mainnet

### Beast Actions Contract

The main contract for managing beast lineups. Users can register their team of 0-5 beasts and swap them as needed.

#### Functions

##### `register(beast1_id, beast2_id, beast3_id, beast4_id, beast5_id)`
Registers a new beast lineup for the caller. You can register anywhere from 0 to 5 beasts.

**Parameters:**
- `beast1_id`: u256 - ID of the first beast (0 for empty slot)
- `beast2_id`: u256 - ID of the second beast (0 for empty slot)
- `beast3_id`: u256 - ID of the third beast (0 for empty slot)
- `beast4_id`: u256 - ID of the fourth beast (0 for empty slot)
- `beast5_id`: u256 - ID of the fifth beast (0 for empty slot)

**Requirements:**
- Caller must own any non-zero beast IDs (verified against the Beasts contract at `0x046dA8955829ADF2bDa310099A0063451923f02E648cF25A1203aac6335CF0e4`)
- Beast IDs can be 0 (empty slot) or valid owned beast IDs

**Events:**
- `BeastLineupRegistered` - Emitted when a lineup is successfully registered

##### `swap(position, new_beast_id)`
Swaps a beast at a specific position in the lineup.

**Parameters:**
- `position`: u8 - Position to swap (0-4, where 0 is the first beast)
- `new_beast_id`: u256 - ID of the new beast to place in that position

**Requirements:**
- Position must be between 0 and 4
- `new_beast_id` cannot be 0 (use register to set empty slots)
- Caller must own the new beast
- Caller must have an existing lineup

**Events:**
- `BeastSwapped` - Emitted when a beast is successfully swapped

### Data Models

#### BeastLineup
Stores the lineup configuration for each player.

**Fields:**
- `player`: ContractAddress - The owner of the lineup
- `beast1_id`: u256 - ID of beast in position 1
- `beast2_id`: u256 - ID of beast in position 2
- `beast3_id`: u256 - ID of beast in position 3
- `beast4_id`: u256 - ID of beast in position 4
- `beast5_id`: u256 - ID of beast in position 5

## Integration

### Using sozo CLI

```bash
# Register a full lineup
sozo execute survivor_valhalla-beast_actions register --wait \
  --calldata 1,2,3,4,5

# Register a partial lineup (only 2 beasts)
sozo execute survivor_valhalla-beast_actions register --wait \
  --calldata 10,20,0,0,0

# Register an empty lineup
sozo execute survivor_valhalla-beast_actions register --wait \
  --calldata 0,0,0,0,0

# Swap a beast at position 2 (0-indexed) with beast ID 99
sozo execute survivor_valhalla-beast_actions swap --wait \
  --calldata 2,99
```

### Using TypeScript/JavaScript

```typescript
// Example using starknet.js
const contract = new Contract(abi, BEAST_ACTIONS_ADDRESS, provider);

// Register lineup
await contract.register(1n, 2n, 3n, 4n, 5n);

// Swap beast
await contract.swap(2, 99n);
```

## Beast Ownership

All beasts must be owned by the caller. Ownership is verified against the Beasts contract:
- **Beasts Contract**: `0x046dA8955829ADF2bDa310099A0063451923f02E648cF25A1203aac6335CF0e4`

The system verifies ownership by calling `owner_of(token_id)` on the Beasts contract before allowing any lineup operations.

## Development

### Building
```bash
cd contract
sozo build
```

### Testing
```bash
cd contract
sozo test
```

### Deployment
The project uses GitHub Actions for automated deployment. See `.github/workflows/deploy-mainnet.yml` for the CI/CD pipeline.

## Architecture

The project follows the Dojo framework patterns:
- **World Contract**: Central registry and permission management
- **Systems**: Business logic (beast_actions)
- **Models**: Data structures (BeastLineup)
- **Events**: On-chain event logging for lineup changes

## License

[Add your license here]