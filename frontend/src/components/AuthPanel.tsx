import { useState } from "react";
import { sendMagicLink, signInWithGoogle, verifyEmailOtp } from "../lib/auth";

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
  const [email, setEmail] = useState("");
  const [emailMethod, setEmailMethod] = useState<"magic-link" | "token">("magic-link");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [otpCode, setOtpCode] = useState("");
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

      if (step === "verify") {
        const { error } = await verifyEmailOtp({
          email,
          token: otpCode.trim()
        });

        if (error) {
          throw error;
        }

        setMessage("Codigo verificado. Entrando a Cinerian...");
      } else {
        const { error } = await sendMagicLink(email);
        if (error) {
          throw error;
        }

        if (emailMethod === "token") {
          setStep("verify");
          setMessage("Te mandamos un email con el link y el codigo. Si estas en la webapp, pega el codigo aca.");
        } else {
          setMessage("Te mandamos un link para entrar directo. Si no lo ves, revisa spam.");
        }
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
        Entra con Google, con link magico o con codigo. Sin contrasena y sin registro manual.
      </p>

      <button
        type="button"
        className="ghost-button"
        onClick={() => void handleGoogleSignIn()}
        disabled={isSubmitting}
      >
        Continuar con Google
      </button>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-toggle">
          <button
            type="button"
            className={emailMethod === "magic-link" ? "primary-button" : "ghost-button"}
            onClick={() => {
              setEmailMethod("magic-link");
              setStep("request");
              setOtpCode("");
              setMessage(null);
            }}
            disabled={isSubmitting}
          >
            Link magico
          </button>
          <button
            type="button"
            className={emailMethod === "token" ? "primary-button" : "ghost-button"}
            onClick={() => {
              setEmailMethod("token");
              setStep("request");
              setOtpCode("");
              setMessage(null);
            }}
            disabled={isSubmitting}
          >
            Codigo
          </button>
        </div>

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

        {emailMethod === "token" && step === "verify" ? (
          <label className="input-stack">
            <span>Codigo de 6 digitos</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              required
            />
          </label>
        ) : null}

        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting
            ? "Procesando..."
            : step === "verify"
              ? "Verificar codigo"
              : emailMethod === "magic-link"
                ? "Recibir link magico"
                : "Recibir codigo"}
        </button>

        {emailMethod === "token" && step === "verify" ? (
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
            Pedir otro metodo
          </button>
        ) : null}
      </form>

      {message ? <div className="inline-status">{message}</div> : null}
    </section>
  );
}
