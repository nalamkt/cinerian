import { useState } from "react";
import { sendMagicLink, signInWithGoogle, verifyEmailOtp } from "../lib/auth";
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
  const [step, setStep] = useState<"request" | "verify">("request");
  const [otpCode, setOtpCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestEmailSignIn() {
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

      setStep("verify");
      setMessage("Te enviamos un email con tu link magico y tu codigo de acceso.");
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === "request") {
      await requestEmailSignIn();
      return;
    }

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

      if (step === "verify") {
        const { error } = await verifyEmailOtp({
          email,
          token: otpCode.trim()
        });

        if (error) {
          throw error;
        }

        setMessage("Codigo verificado. Entrando a Cinerian...");
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

      {step === "request" &&
        (inviteInfo ? (
          <div className="inline-status">
            Te invitó <strong>{inviteInfo.inviterDisplayName}</strong> (@{inviteInfo.inviterUsername}). Al
            registrarte vas a empezar a seguirlo automáticamente.
          </div>
        ) : (
          <div className="inline-status">
            Cinerian es por invitación. Si sos nuevo, necesitás un link de invitación de alguien que ya
            esté adentro.
          </div>
        ))}

      {step === "request" ? (
        <>
          <button
            type="button"
            className="google-button"
            onClick={() => void handleGoogleSignIn()}
            disabled={isSubmitting}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.23a4.47 4.47 0 0 1-1.94 2.93v2.79h3.59c2.1-1.93 3.32-4.78 3.32-7.75Z" />
              <path fill="#34A853" d="M12 21.76c2.62 0 4.82-.87 6.43-2.35l-3.59-2.79c-1 .67-2.27 1.07-3.84 1.07-2.95 0-5.45-1.99-6.35-4.66H.94v2.88A9.72 9.72 0 0 0 12 21.76Z" />
              <path fill="#FBBC05" d="M5.65 13.03A5.84 5.84 0 0 1 5.3 11c0-.71.12-1.4.35-2.03V6.09H1.94A9.76 9.76 0 0 0 .9 11c0 1.77.43 3.45 1.04 4.91l3.71-2.88Z" />
              <path fill="#EA4335" d="M12 4.31c1.77 0 3.36.61 4.61 1.81l3.46-3.46C16.81.61 14.61-.76 12 0A9.72 9.72 0 0 0 1.94 6.09l3.71 2.88C6.55 6.3 9.05 4.31 12 4.31Z" />
            </svg>
            Continuar con Google
          </button>

          <div className="auth-divider" aria-hidden="true">
            <span />
            <b>o</b>
            <span />
          </div>
        </>
      ) : null}

      <form className="auth-form" onSubmit={handleSubmit}>
        {step === "verify" ? (
          <div className="auth-email-sent">
            <h3>Revisa tu email</h3>
            <p>
              Te enviamos un email a <strong>{email}</strong>. Podes entrar tocando el link magico
              del correo o pegar el codigo que recibiste aca.
            </p>
          </div>
        ) : null}

        <label className="input-stack">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vos@cinerian.com"
            required
            disabled={isSubmitting || step === "verify"}
          />
        </label>

        {step === "verify" ? (
          <label className="input-stack">
            <span>Token del email</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={(event) =>
                setOtpCode(event.target.value.replace(/\s/g, "").slice(0, 12))
              }
              placeholder="Pega el token del email"
              required
            />
          </label>
        ) : null}

        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting
            ? "Procesando..."
            : step === "verify"
              ? "Ingresar con el codigo"
              : "Iniciar sesion con email"}
        </button>

        {step === "verify" ? (
          <div className="auth-email-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setStep("request");
                setOtpCode("");
                setMessage(null);
              }}
              disabled={isSubmitting}
            >
              Usar otro email
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => void requestEmailSignIn()}
              disabled={isSubmitting}
            >
              Reenviar email
            </button>
          </div>
        ) : null}
      </form>

      {message ? <div className="inline-status">{message}</div> : null}
    </section>
  );
}
