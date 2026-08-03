import { useState } from "react";
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from "../lib/auth";

type AuthPanelProps = {
  isSupabaseReady: boolean;
};

function getAuthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "No pude autenticarte.";
  }

  const normalizedMessage = error.message.toLowerCase();

  if (normalizedMessage.includes("email rate limit exceeded")) {
    return "Supabase bloqueo temporalmente el envio de emails. Si la confirmacion por email esta activa, espera al menos 60 segundos y revisa Authentication > Rate Limits y Authentication > Emails > SMTP en Supabase.";
  }

  if (normalizedMessage.includes("user already registered")) {
    return "Ese email ya tiene una cuenta. Prueba iniciar sesion o recuperar la contrasena.";
  }

  return error.message;
}

export function AuthPanel({ isSupabaseReady }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!isSupabaseReady) {
      setMessage("Faltan las credenciales de Supabase.");
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage(null);

      if (mode === "register") {
        const { error, data } = await signUpWithEmail({
          email,
          password,
          username,
          displayName
        });

        if (error) {
          throw error;
        }

        setMessage(
          data.session
            ? "Cuenta creada. Ya deberias entrar a la app."
            : "Cuenta creada. Si activaste confirmacion por email, revisa tu inbox."
        );
      } else {
        const { error } = await signInWithEmail({ email, password });
        if (error) {
          throw error;
        }

        setMessage("Sesion iniciada.");
      }
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    if (isSubmitting) {
      return;
    }

    if (!isSupabaseReady) {
      setMessage("Faltan las credenciales de Supabase.");
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage(null);

      const { error } = await signInWithGoogle();
      if (error) {
        throw error;
      }
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel auth-panel">
      <p className="section-eyebrow">Acceso</p>
      <h2>Entra a Cinerian</h2>
      <p className="section-description">
        Crea tu cuenta o inicia sesion para entrar a la experiencia completa.
      </p>

      <button type="button" className="ghost-button" onClick={() => void handleGoogleSignIn()}>
        Continuar con Google
      </button>

      <div className="auth-toggle">
        <button
          type="button"
          className={mode === "register" ? "primary-button" : "ghost-button"}
          onClick={() => setMode("register")}
        >
          Crear cuenta
        </button>
        <button
          type="button"
          className={mode === "login" ? "primary-button" : "ghost-button"}
          onClick={() => setMode("login")}
        >
          Iniciar sesion
        </button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="input-stack">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vos@cinerian.com"
            required
          />
        </label>

        <label className="input-stack">
          <span>Contrasena</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimo 6 caracteres"
            required
          />
        </label>

        {mode === "register" ? (
          <>
            <label className="input-stack">
              <span>Username</span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="nalamkt"
                required
              />
            </label>

            <label className="input-stack">
              <span>Nombre visible</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Isidoro"
                required
              />
            </label>
          </>
        ) : null}

        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? "Procesando..." : mode === "register" ? "Crear cuenta" : "Entrar"}
        </button>
      </form>

      {message ? <div className="inline-status">{message}</div> : null}
    </section>
  );
}
