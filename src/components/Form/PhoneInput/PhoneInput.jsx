import 'react-phone-number-input/style.css';
import './style.css';
import ReactPhoneInput from 'react-phone-number-input';

/**
 * Controlled phone input.
 * - Don't force "+" as initial value (react-phone-number-input warns).
 * - Use undefined when empty; persist '' back to your form state.
 */
const PhoneInput = ({ name, value, setValue }) => {
  const styles =
    "text-base sm:text-lg w-full py-3 px-4 border border-gray-400 rounded-sm placeholder-gray-500";

  return (
    <ReactPhoneInput
      value={value || undefined}
      onChange={(phone) =>
        setValue({ target: { name, value: phone || '' } })
      }
      international
      className={styles}
    />
  );
};

export default PhoneInput;