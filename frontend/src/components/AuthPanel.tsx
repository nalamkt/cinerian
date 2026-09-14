import { useEffect, useRef, useState } from "react";
import { sendMagicLink, signInWithGoogle, verifyEmailOtp } from "../lib/auth";

type AuthPanelProps = {
  isSupabaseReady: boolean;
};

type AuthMessage = {
  kind: "ok" | "error";
  text: string;
};

const RESEND_COOLDOWN_SECONDS = 60;

/*
  Ningun mensaje de Supabase llega crudo al usuario: son en ingles y tecnicos.
  El texto original se manda a la consola para poder diagnosticar.
*/
function getAuthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "No pudimos autenticarte. Probá de nuevo en un momento.";
  }

  console.error("[auth]", error.message);

  const normalizedMessage = error.message.toLowerCase();

  if (normalizedMessage.includes("email rate limit exceeded")) {
    return "Pediste varios emails seguidos. Esperá un minuto y volvé a intentar.";
  }

  if (normalizedMessage.includes("user already registered")) {
    return "Ese email ya tiene cuenta. Pedí el link de acceso y entrás igual.";
  }

  if (normalizedMessage.includes("expired")) {
    return "Ese código ya venció. Pedí uno nuevo y usalo dentro de los 10 minutos.";
  }

  if (normalizedMessage.includes("token") || normalizedMessage.includes("otp")) {
    return "Ese código no es válido. Revisá que sean los 6 dígitos del último email.";
  }

  if (
    normalizedMessage.includes("invalid email") ||
    normalizedMessage.includes("unable to validate email")
  ) {
    return "Ese email no parece válido. Fijate si le falta algo.";
  }

  return "No pudimos autenticarte. Probá de nuevo en un momento.";
}

export function AuthPanel({ isSupabaseReady }: AuthPanelProps) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [otpCode, setOtpCode] = useState("");
  const [message, setMessage] = useState<AuthMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  /* El contador ataca la causa del rate limit de Supabase, no el sintoma. */
  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timeoutId);
  }, [cooldown]);

  useEffect(() => {
    if (step === "verify") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  async function requestEmailSignIn() {
    if (isSubmitting || cooldown > 0) {
      return;
    }

    if (!isSupabaseReady) {
      setMessage({ kind: "error", text: "Faltan las credenciales de Supabase." });
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
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setMessage({
        kind: "ok",
        text: "Listo, te lo mandamos. Puede tardar un minuto en llegar."
      });
    } catch (error) {
      setMessage({ kind: "error", text: getAuthErrorMessage(error) });
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
      setMessage({ kind: "error", text: "Faltan las credenciales de Supabase." });
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage(null);

      const { error } = await verifyEmailOtp({
        email,
        token: otpCode.trim()
      });

      if (error) {
        throw error;
      }

      setMessage({ kind: "ok", text: "Código verificado. Entrando a Cinerian..." });
    } catch (error) {
      setMessage({ kind: "error", text: getAuthErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    if (isSubmitting) {
      return;
    }

    if (!isSupabaseReady) {
      setMessage({ kind: "error", text: "Faltan las credenciales de Supabase." });
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
      setMessage({ kind: "error", text: getAuthErrorMessage(error) });
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel">
      <h2>{step === "verify" ? "Revisá tu email" : "Entrá a Cinerian"}</h2>

      <form className="auth-form" onSubmit={handleSubmit}>
        {step === "verify" ? (
          <p className="auth-sent-to">
            Te lo enviamos a <strong>{email}</strong>. Tocá el link del mensaje, o pegá el
            código de 6 dígitos acá abajo.
          </p>
        ) : null}

        {step === "request" ? (
          <>
            <label className="auth-field" htmlFor="auth-email">
              <span className="sr-only">Email</span>
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Tu email"
                required
                disabled={isSubmitting}
              />
            </label>

            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
              {isSubmitting ? "Enviando" : "Enviame el link de acceso"}
            </button>

            <p className="auth-hint">Sin contraseña: te llega un link para entrar de una.</p>
          </>
        ) : (
          <>
            <label className="auth-field" htmlFor="auth-code">
              <span className="sr-only">Código del email</span>
              <input
                id="auth-code"
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="auth-code-input"
                value={otpCode}
                onChange={(event) =>
                  setOtpCode(event.target.value.replace(/\s/g, "").slice(0, 6))
                }
                placeholder="Código de 6 dígitos"
                required
              />
            </label>

            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
              {isSubmitting ? "Verificando" : "Ingresar con el código"}
            </button>

            <div className="auth-resend">
              <span className="auth-resend__cooldown">
                {cooldown > 0 ? `Reenviar en ${cooldown}s` : "¿No llegó?"}
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => void requestEmailSignIn()}
                disabled={isSubmitting || cooldown > 0}
              >
                Reenviar email
              </button>
            </div>
          </>
        )}

        {message ? (
          <div className={`auth-status auth-status--${message.kind}`} role="status" aria-live="polite">
            {message.text}
          </div>
        ) : null}
      </form>

      {step === "request" ? (
        <>
          <div className="auth-divider" aria-hidden="true">
            <span />
            <b>o</b>
            <span />
          </div>

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
        </>
      ) : (
        <button
          type="button"
          className="text-button auth-back"
          onClick={() => {
            setStep("request");
            setOtpCode("");
            setMessage(null);
          }}
          disabled={isSubmitting}
        >
          ← Usar otro email
        </button>
      )}
    </section>
  );
}
