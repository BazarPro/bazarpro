import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimeInput } from './time-input';

function Harness({ initial = '', onValue }: { initial?: string; onValue: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <TimeInput
      aria-label="time"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
}

describe('TimeInput', () => {
  it('is a text field, so no browser shows AM/PM', () => {
    render(<Harness onValue={() => {}} />);
    expect(screen.getByLabelText('time')).toHaveAttribute('type', 'text');
  });

  it('takes a complete time right away', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(screen.getByLabelText('time'), { target: { value: '12:59' } });
    expect(onValue).toHaveBeenLastCalledWith('12:59');
  });

  it.each([
    ['9', '09:00'],
    ['930', '09:30'],
    ['1745', '17:45'],
    ['17.5', '17:05'],
  ])('completes %s to %s on blur', (typed, expected) => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText('time');
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.blur(input);
    expect(onValue).toHaveBeenLastCalledWith(expected);
    expect(input).toHaveValue(expected);
  });

  it('drops what is no time and keeps the last value', () => {
    const onValue = vi.fn();
    render(<Harness initial="10:00" onValue={onValue} />);
    const input = screen.getByLabelText('time');
    fireEvent.change(input, { target: { value: '25:00' } });
    fireEvent.blur(input);
    expect(onValue).not.toHaveBeenCalled();
    expect(input).toHaveValue('10:00');
  });

  it('can be emptied', () => {
    const onValue = vi.fn();
    render(<Harness initial="10:00" onValue={onValue} />);
    fireEvent.change(screen.getByLabelText('time'), { target: { value: '' } });
    expect(onValue).toHaveBeenLastCalledWith('');
  });
});
