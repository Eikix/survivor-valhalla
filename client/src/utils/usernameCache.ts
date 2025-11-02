// src/utils/usernameCache.ts
import { lookupAddresses } from '@cartridge/controller';
import { useEffect, useState } from 'react';

// In-memory cache for username lookups
const usernameCache = new Map<string, string | null>();

// Track pending requests to avoid duplicate fetches
const pendingRequests = new Map<string, Promise<string | null>>();

/**
 * Normalize address to lowercase and remove zero-padding for Cartridge API
 * Cartridge expects "lowercase non-zero-padded hex" format
 * e.g., 0x00123abc -> 0x123abc
 */
function normalizeAddress(address: string): string {
  const lower = address.toLowerCase();

  // Remove zero-padding: replace 0x0+ with 0x, but keep at least one character after 0x
  // Match 0x followed by one or more zeros, then capture the rest
  const withoutPadding = lower.replace(/^0x0+/, '0x');

  // Edge case: if address was just 0x0 or 0x00..., keep it as 0x0
  if (withoutPadding === '0x' || withoutPadding === '') {
    return '0x0';
  }

  console.log(`[normalizeAddress] ${address} -> ${withoutPadding}`);
  return withoutPadding;
}

/**
 * Lookup a single username for an address with caching
 */
async function lookupUsername(address: string): Promise<string | null> {
  const normalized = normalizeAddress(address);

  // Check cache first
  if (usernameCache.has(normalized)) {
    return usernameCache.get(normalized) ?? null;
  }

  // Check if request is already pending
  if (pendingRequests.has(normalized)) {
    return pendingRequests.get(normalized)!;
  }

  // Create new request
  const requestPromise = (async () => {
    try {
      // Use normalized address for the API call
      const addressMap = await lookupAddresses([normalized]);
      const username = addressMap.get(normalized) ?? null;

      // Cache the result
      usernameCache.set(normalized, username);

      console.log(`[UsernameCache] Looked up ${normalized}:`, username || 'no username found');

      return username;
    } catch (error) {
      console.warn(`Failed to lookup username for ${normalized}:`, error);
      // Cache null to avoid repeated failed requests
      usernameCache.set(normalized, null);
      return null;
    } finally {
      // Clean up pending request
      pendingRequests.delete(normalized);
    }
  })();

  pendingRequests.set(normalized, requestPromise);
  return requestPromise;
}

/**
 * Batch lookup multiple usernames with caching
 */
async function lookupUsernames(addresses: string[]): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  // Separate cached and uncached addresses
  const uncachedAddresses: string[] = [];

  for (const address of addresses) {
    const normalized = normalizeAddress(address);
    if (usernameCache.has(normalized)) {
      results.set(address, usernameCache.get(normalized) ?? null);
    } else {
      uncachedAddresses.push(address);
    }
  }

  // Fetch uncached addresses in batch
  if (uncachedAddresses.length > 0) {
    try {
      // Normalize all addresses before API call
      const normalizedAddresses = uncachedAddresses.map(addr => normalizeAddress(addr));
      const addressMap = await lookupAddresses(normalizedAddresses);

      console.log(`[UsernameCache] Batch lookup for ${normalizedAddresses.length} addresses:`, addressMap);

      for (const address of uncachedAddresses) {
        const normalized = normalizeAddress(address);
        const username = addressMap.get(normalized) ?? null;

        // Cache the result
        usernameCache.set(normalized, username);
        results.set(address, username);
      }
    } catch (error) {
      console.warn('Failed to batch lookup usernames:', error);
      // Cache null for failed addresses
      for (const address of uncachedAddresses) {
        const normalized = normalizeAddress(address);
        usernameCache.set(normalized, null);
        results.set(address, null);
      }
    }
  }

  return results;
}

/**
 * React hook to lookup a single username
 */
export function useUsername(address: string | undefined): {
  username: string | null;
  isLoading: boolean;
} {
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setUsername(null);
      setIsLoading(false);
      return;
    }

    const normalized = normalizeAddress(address);

    // Check cache immediately
    if (usernameCache.has(normalized)) {
      setUsername(usernameCache.get(normalized) ?? null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    lookupUsername(address).then((result) => {
      setUsername(result);
      setIsLoading(false);
    });
  }, [address]);

  return { username, isLoading };
}

/**
 * React hook to lookup multiple usernames
 */
export function useUsernames(addresses: string[]): {
  usernames: Map<string, string | null>;
  isLoading: boolean;
} {
  const [usernames, setUsernames] = useState<Map<string, string | null>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (addresses.length === 0) {
      setUsernames(new Map());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    lookupUsernames(addresses).then((results) => {
      setUsernames(results);
      setIsLoading(false);
    });
  }, [addresses.join(',')]); // Re-run if addresses change

  return { usernames, isLoading };
}

/**
 * Clear the username cache (useful for testing or when user logs out)
 */
export function clearUsernameCache(): void {
  usernameCache.clear();
}
