import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getMe } from '../api.js';
import type { User } from '../types.js';
import { ChatShell } from './ChatShell.js';
import { LoginForm } from './LoginForm.js';
import { RegisterForm } from './RegisterForm.js';

type Mode = 'login' | 'register';

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // For the scrambling effect only
const frameRate = 30; // 30 because we don't want it going too fast lol 
const letterDuration = 1000; // one second
const letterDelay = 500; // half a second

export function AuthGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getMe()
      .then((response) => {
        if (active) setUser(response.user);
      })
      .catch(() => {
        if (active) setUser(null);
      });

    return () => {
      active = false;
    };
  }, []);
  
  const modeLabel = useMemo(() => (mode === 'login' ? 'LOGIN' : 'REGISTER'), [mode]);
  
  if (user === undefined) {
    return <AuthFrame modeLabel="BOOT" subtitle="Checking your session." />;
  }

  if (user) {
    return <ChatShell user={user} />;
  }

  return (
    <>
      <MatrixRain />
      <AuthFrame modeLabel={modeLabel} subtitle="Enter credentials or create a new identity.">
        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === 'login' ? 'active' : ''} role="tab" aria-selected={mode === 'login'} onClick={() => setMode('login')}>
            LOGIN
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} role="tab" aria-selected={mode === 'register'} onClick={() => setMode('register')}>
            REGISTER
          </button>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        {mode === 'login' ? (
          <LoginForm
            onError={setError}
            onSwitch={() => {
              setError('');
              setMode('register');
            }}
          />
        ) : (
          <RegisterForm
            onError={setError}
            onSwitch={() => {
              setError('');
              setMode('login');
            }}
          />
        )}
      </AuthFrame>
    </>
  );
}

function AuthFrame({ modeLabel, subtitle, children }: { modeLabel: string; subtitle?: string; children?: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">UC Comms</p>
        <h1 id="auth-title"><AnimatedWord word={modeLabel} /></h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </section>
      <aside className="auth-side" aria-hidden="true">
        <div className="signal-orb" />
        <p>Login or register to continue, if you do not have an invite code, you cannot access.</p>
      </aside>
    </main>
  );
}

function AnimatedWord({ word }: { word: string }) {
  const [display, setDisplay] = useState(scramble(word));

  useEffect(() => {
    let cancelled = false;
    let frame = 0;

    setDisplay(scramble(word));

    const timer = window.setInterval(() => {
      if (cancelled) return;

      frame += 1;
      const elapsed = frame * frameRate;

      setDisplay((current) => {
        const next = current
          .split('')
          .map((character, index) => {
            if (character === ' ') return ' ';

            const letterElapsed = elapsed - index * letterDelay;
            if (letterElapsed < 0) return character;
            if (letterElapsed >= letterDuration) return word[index] ?? character;

            return randomCharacter();
          })
          .join('');

        return next;
      });

      if (elapsed > word.length * letterDelay + letterDuration) {
        if (!cancelled) setDisplay(word);
        window.clearInterval(timer);
      }
    }, frameRate);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [word]);

  return <span aria-label={word}>{display}</span>;
}

function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (canvasElement === null) return;

    const canvas = canvasElement;
    const drawingContext = canvas.getContext('2d');
    if (drawingContext === null) return;

    const context = drawingContext;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const fontSize = 14;
    /// Matrix rain characters, Japanese katakana, Latin letters, numbers, and symbols to give variety. Also in the movies, it was just Japanese Katakana if I recall correctly.
    const glyphs = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンλABCDEFGHIJKLMNOPQRSTUVWXYZλabcdefghijklmnopqrstuvwxyzλ0123456789λ!@#$%^&*()-_=+[]{}|;:\'"/?,<.>'.split('');
    let width = 0;
    let height = 0;
    let columns = 0;
    let drops: number[] = [];
    let frameId = 0;
    let lastDraw = 0;

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      columns = Math.ceil(width / fontSize);
      drops = Array.from({ length: columns }, () => Math.random() * -100);
      context.fillStyle = '#020403';
      context.fillRect(0, 0, width, height);
    };

    const draw = (timestamp: number) => {
      frameId = window.requestAnimationFrame(draw);

      if (timestamp - lastDraw < 45) return;
      lastDraw = timestamp;

      context.fillStyle = 'rgba(2, 4, 3, 0.12)';
      context.fillRect(0, 0, width, height);
      context.font = `${fontSize}px "SFMono-Regular", Consolas, monospace`;

      for (let index = 0; index < drops.length; index += 1) {
        const glyph = glyphs[Math.floor(Math.random() * glyphs.length)] ?? '0';
        const x = index * fontSize;
        const y = drops[index] * fontSize;

        context.fillStyle = Math.random() > 0.965 ? '#f0fff6' : '#41ffa8';
        context.fillText(glyph, x, y);

        if (y > height && Math.random() > 0.975) {
          drops[index] = 0;
        }

        drops[index] += 1;
      }
    }

    resize();
    window.addEventListener('resize', resize);
    frameId = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas className="matrix-rain" ref={canvasRef} aria-hidden="true" />;
}

function randomCharacter() {
  return characters[Math.floor(Math.random() * characters.length)] ?? '_';
}

function scramble(word: string) {
  return word
    .split('')
    .map((character) => (character === ' ' ? ' ' : randomCharacter()))
    .join('');
}
