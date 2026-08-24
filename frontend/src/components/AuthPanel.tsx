import { useState } from "react";
import { sendMagicLink, signInWithGoogle } from "../lib/auth";
import type { InviteInfo } from "../lib/invites";

type AuthPanelProps = {
  isSupabaseReady: boolean;
  inviteInfo?: InviteInfo | null;
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

export function AuthPanel({ isSupabaseReady, inviteInfo }: AuthPanelProps) {
  const [email, setEmail] = useState("");
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

      const { error } = await sendMagicLink(email);
      if (error) {
        throw error;
      }

      setMessage("Te mandamos un link para entrar directo. Si no lo ves, revisa spam.");
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
        Entra con Google o recibe un link magico en tu email. Sin contrasena y sin registro manual.
      </p>

      {inviteInfo ? (
        <div className="inline-status">
          Te invitó <strong>{inviteInfo.inviterDisplayName}</strong> (@{inviteInfo.inviterUsername}). Al
          registrarte vas a empezar a seguirlo automáticamente.
        </div>
      ) : (
        <div className="inline-status">
          Cinerian es por invitación. Si sos nuevo, necesitás un link de invitación de alguien que ya
          esté adentro.
        </div>
      )}

      <button
        type="button"
        className="ghost-button"
        onClick={() => void handleGoogleSignIn()}
        disabled={isSubmitting}
      >
        Continuar con Google
      </button>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="input-stack">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vos@cinerian.com"
            required
            disabled={isSubmitting}
          />
        </label>

        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? "Procesando..." : "Recibir link magico"}
        </button>
      </form>

      {message ? <div className="inline-status">{message}</div> : null}
    </section>
  );
}
