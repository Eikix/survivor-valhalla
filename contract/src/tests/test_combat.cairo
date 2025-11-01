#[cfg(test)]
mod test_combat {
    use survivor_valhalla::models::{Beast, CachedAdventurer};
    use survivor_valhalla::systems::combat::{simulate_battle, CombatResult, adventurer_vs_beast};
    use survivor_valhalla::constants::{BEAST_TYPE_MAGICAL, BEAST_TYPE_HUNTER, BEAST_TYPE_BRUTE};
    use starknet::contract_address_const;
    
    const PLAYER1: felt252 = 'PLAYER1';
    
    #[test]
    fn test_type_effectiveness() {
        let player = contract_address_const::<PLAYER1>();
        
        // Create a magical beast (weak to bludgeon weapons)
        let magical_beast = Beast {
            player,
            position: 1,
            token_id: 1,
            beast_id: 1,
            level: 10,
            health: 100,
            beast_type: BEAST_TYPE_MAGICAL,
            tier: 2,
        };
        
        // Create adventurer with bludgeon weapon (id 13-18)
        let adventurer_with_bludgeon = CachedAdventurer {
            player,
            adventurer_id: 1,
            health: 150,
            level: 5,
            strength: 15,
            dexterity: 10,
            vitality: 12,
            intelligence: 8,
            wisdom: 6,
            charisma: 7,
            luck: 9,
            weapon_id: 15, // Bludgeon weapon
            chest_id: 2,
            head_id: 3,
            waist_id: 4,
            foot_id: 5,
            hand_id: 6,
            neck_id: 7,
            ring_id: 8,
        };
        
        // Test combat - adventurer should win due to type advantage
        let result = adventurer_vs_beast(@adventurer_with_bludgeon, @magical_beast);
        assert(result.winner_is_attacker, 'Should win with type advantage');
    }
    
    #[test]
    fn test_beast_vs_adventurer_battle() {
        let player = contract_address_const::<PLAYER1>();
        
        // Create a brute beast
        let brute_beast = Beast {
            player,
            position: 1,
            token_id: 1,
            beast_id: 1,
            level: 10,
            health: 120,
            beast_type: BEAST_TYPE_BRUTE,
            tier: 3,
        };
        
        // Create adventurer with low health
        let weak_adventurer = CachedAdventurer {
            player,
            adventurer_id: 1,
            health: 50,
            level: 3,
            strength: 8,
            dexterity: 8,
            vitality: 8,
            intelligence: 8,
            wisdom: 8,
            charisma: 8,
            luck: 8,
            weapon_id: 1,
            chest_id: 1,
            head_id: 1,
            waist_id: 1,
            foot_id: 1,
            hand_id: 1,
            neck_id: 1,
            ring_id: 1,
        };
        
        // Test combat - beast should win
        let result = adventurer_vs_beast(@weak_adventurer, @brute_beast);
        assert(!result.winner_is_attacker, 'Beast should win');
    }
    
    #[test]
    fn test_full_battle_simulation() {
        let player = contract_address_const::<PLAYER1>();
        
        // Create adventurer lineup
        let mut adventurers: Array<CachedAdventurer> = ArrayTrait::new();
        
        // Strong adventurer
        adventurers.append(CachedAdventurer {
            player,
            adventurer_id: 1,
            health: 200,
            level: 10,
            strength: 20,
            dexterity: 15,
            vitality: 18,
            intelligence: 10,
            wisdom: 8,
            charisma: 9,
            luck: 12,
            weapon_id: 10, // Blade weapon
            chest_id: 10,  // Hide armor
            head_id: 3,
            waist_id: 4,
            foot_id: 5,
            hand_id: 6,
            neck_id: 7,
            ring_id: 8,
        });
        
        // Empty slots
        let mut i: u32 = 1;
        loop {
            if i >= 5 { break; }
            adventurers.append(CachedAdventurer {
                player,
                adventurer_id: 0,
                health: 0,
                level: 0,
                strength: 0,
                dexterity: 0,
                vitality: 0,
                intelligence: 0,
                wisdom: 0,
                charisma: 0,
                luck: 0,
                weapon_id: 0,
                chest_id: 0,
                head_id: 0,
                waist_id: 0,
                foot_id: 0,
                hand_id: 0,
                neck_id: 0,
                ring_id: 0,
            });
            i += 1;
        };
        
        // Create beast lineup
        let mut beasts: Array<Beast> = ArrayTrait::new();
        
        // Weak beast
        beasts.append(Beast {
            player,
            position: 1,
            token_id: 1,
            beast_id: 1,
            level: 5,
            health: 50,
            beast_type: BEAST_TYPE_HUNTER,
            tier: 1,
        });
        
        // Empty slots
        i = 1;
        loop {
            if i >= 5 { break; }
            beasts.append(Beast {
                player,
                position: (i + 1).try_into().unwrap(),
                token_id: 0,
                beast_id: 0,
                level: 0,
                health: 0,
                beast_type: 0,
                tier: 0,
            });
            i += 1;
        };
        
        // Simulate full battle
        let attacker_wins = simulate_battle(adventurers, beasts);
        assert(attacker_wins, 'Strong adventurer should win');
    }
}