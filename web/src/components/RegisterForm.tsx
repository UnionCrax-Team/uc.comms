import { FormEvent, useState } from 'react';
import { register } from '../api.js';
import { getErrorMessage } from '../api.js';

export function RegisterForm({ onError, onSwitch }: { onError: (error: string) => void; onSwitch: () => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      await register(username, displayName, password, inviteCode || undefined);
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
        <span>Display name</span>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required />
      </label>
      <label>
        <span>Invite code</span>
        <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="one-time-code" placeholder="Optional if registration is open" />
      </label>
      <label>
        <span>Password</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? 'Creating room key…' : 'Create account'}
      </button>
    </form>
    // almost forgot about this one lolol
  );
}
