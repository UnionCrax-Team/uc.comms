import { FormEvent, useState } from 'react';
import { login } from '../api.js';
import { getErrorMessage } from '../api.js';

export function LoginForm({ onError, onSwitch }: { onError: (error: string) => void; onSwitch: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      await login(username, password);
      window.location.reload();
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="stacked-form" onSubmit={submit}>
      <label>
        <span>Username</span>
        <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
      </label>
      <label>
        <span>Password</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
      </label>
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? 'Signing in…' : 'Enter room'}
      </button>
    </form>
    // got rid of the other button
  );
}
