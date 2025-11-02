import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

interface TransactionToastProps {
  hash?: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
}

const TransactionToast = ({ hash, status, message }: TransactionToastProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3"
    >
      {status === 'pending' && (
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full"
          />
          <div>
            <div className="font-bold text-amber-400">Transaction Pending</div>
            <div className="text-xs text-gray-400">
              {message || 'Processing transaction...'}
            </div>
            {hash && (
              <div className="text-xs text-gray-500 font-mono mt-1">
                {hash.slice(0, 10)}...{hash.slice(-8)}
              </div>
            )}
          </div>
        </div>
      )}
      
      {status === 'success' && (
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center"
          >
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M5 13l4 4L19 7"></path>
            </svg>
          </motion.div>
          <div>
            <div className="font-bold text-emerald-400">Transaction Confirmed</div>
            <div className="text-xs text-gray-400">
              {message || 'Transaction completed successfully'}
            </div>
            {hash && (
              <div className="text-xs text-gray-500 font-mono mt-1">
                {hash.slice(0, 10)}...{hash.slice(-8)}
              </div>
            )}
          </div>
        </div>
      )}
      
      {status === 'error' && (
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
          >
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </motion.div>
          <div>
            <div className="font-bold text-red-400">Transaction Failed</div>
            <div className="text-xs text-gray-400">
              {message || 'Transaction could not be completed'}
            </div>
            {hash && (
              <div className="text-xs text-gray-500 font-mono mt-1">
                {hash.slice(0, 10)}...{hash.slice(-8)}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export const useTransactionToast = () => {
  const showTransaction = (hash?: string, message?: string) => {
    const toastId = toast.custom(
      <TransactionToast hash={hash} status="pending" message={message} />,
      {
        duration: Infinity,
        position: 'bottom-right',
      }
    );
    
    return {
      success: (successMessage?: string) => {
        toast.dismiss(toastId);
        toast.custom(
          <TransactionToast hash={hash} status="success" message={successMessage} />,
          {
            duration: 5000,
            position: 'bottom-right',
          }
        );
      },
      error: (errorMessage?: string) => {
        toast.dismiss(toastId);
        toast.custom(
          <TransactionToast hash={hash} status="error" message={errorMessage} />,
          {
            duration: 5000,
            position: 'bottom-right',
          }
        );
      },
      dismiss: () => toast.dismiss(toastId),
    };
  };

  return { showTransaction };
};

// Hook to monitor transaction status automatically
export const useTransactionMonitor = (txHash?: string, enabled = true) => {
  const { showTransaction } = useTransactionToast();

  useEffect(() => {
    if (!txHash || !enabled) return;

    const tx = showTransaction(txHash, 'Transaction submitted');

    // In a real implementation, you would monitor the actual transaction status
    // For now, we'll simulate with a timeout
    const timeout = setTimeout(() => {
      // Randomly succeed or fail for demo
      if (Math.random() > 0.1) {
        tx.success('Transaction confirmed on chain');
      } else {
        tx.error('Transaction reverted');
      }
    }, 3000);

    return () => {
      clearTimeout(timeout);
      tx.dismiss();
    };
  }, [txHash, enabled]);
};
