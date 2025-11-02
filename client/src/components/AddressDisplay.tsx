// src/components/AddressDisplay.tsx
import { useUsername } from '../utils/usernameCache';

interface AddressDisplayProps {
  address: string | undefined;
  format?: 'short' | 'long';
  className?: string;
  showTooltip?: boolean;
}

/**
 * Component that displays either a Cartridge username or a shortened address
 * @param address - The wallet address to display
 * @param format - 'short' (6...4) or 'long' (8...6) address format
 * @param className - Additional CSS classes
 * @param showTooltip - Show full address on hover (default: true)
 */
export function AddressDisplay({
  address,
  format = 'short',
  className = '',
  showTooltip = true,
}: AddressDisplayProps) {
  const { username, isLoading } = useUsername(address);

  if (!address) {
    return <span className={className}>-</span>;
  }

  // Debug logging
  console.log('[AddressDisplay] Rendering:', { address, username, isLoading });

  // Format the address based on the format prop
  const formatAddress = (addr: string): string => {
    if (format === 'long') {
      return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
    }
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const displayText = username || formatAddress(address);
  const isUsername = !!username;

  // Different styling for usernames vs addresses
  const baseClassName = isUsername
    ? 'text-emerald-400 font-medium' // Readable font for usernames
    : 'font-mono'; // Monospace for addresses

  const fullClassName = `${baseClassName} ${className}`;

  if (showTooltip) {
    return (
      <span className={fullClassName} title={address}>
        {isLoading ? formatAddress(address) : displayText}
      </span>
    );
  }

  return (
    <span className={fullClassName}>
      {isLoading ? formatAddress(address) : displayText}
    </span>
  );
}
