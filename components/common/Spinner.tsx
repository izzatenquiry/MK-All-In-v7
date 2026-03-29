
import React from 'react';

export type SpinnerVariant = 'default' | 'success';

interface SpinnerProps {
  variant?: SpinnerVariant;
}

const Spinner: React.FC<SpinnerProps> = ({ variant = 'default' }) => {
  const outer =
    variant === 'success'
      ? 'border-emerald-500 border-t-transparent'
      : 'border-primary-500 border-t-transparent';
  const inner =
    variant === 'success'
      ? 'border-emerald-400 dark:border-emerald-500 border-b-transparent'
      : 'border-neutral-400 dark:border-neutral-600 border-b-transparent';

  return (
    <div className="relative h-8 w-8 mx-auto">
      <div
        className={`absolute top-0 left-0 h-full w-full border-4 border-solid rounded-full animate-spin ${outer}`}
        style={{ animationDuration: '1.2s' }}
      />
      <div className="absolute top-0 left-0 h-full w-full p-2">
        <div className={`h-full w-full border-2 border-solid rounded-full animate-reverse-spin ${inner}`} />
      </div>
    </div>
  );
};

export default Spinner;
