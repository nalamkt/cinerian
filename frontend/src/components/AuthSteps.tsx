/*
  Que hace Cinerian, en tres filas. Va solo en mobile: ahi no entra el abanico
  de fichas y el visitante no tiene de donde deducir de que va la app.

  Son tres verbos en orden, porque el orden es la explicacion: primero marcas,
  despues seguis gente, y de eso sale el ranking. Sin el tercero los dos
  primeros no se entienden.
*/

type Step = {
  title: string;
  detail: string;
  icon: JSX.Element;
};

const STEPS: Step[] = [
  {
    title: "Marcá lo que viste",
    detail: "Películas y series, con el puntaje que vos le ponés.",
    icon: <path d="M20 6 9 17l-5-5" />
  },
  {
    title: "Seguí a tus amigos",
    detail: "Los que ven tanto cine como vos, no desconocidos.",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    )
  },
  {
    title: "Tu ranking se arma solo",
    detail: "Con lo que ellos puntuaron. Nunca más “qué miro hoy”.",
    icon: (
      <>
        <path d="M3 17l5-5 4 3 8-8" />
        <path d="M15 7h5v5" />
      </>
    )
  }
];

export function AuthSteps() {
  return (
    <ul className="auth-steps">
      {STEPS.map((step) => (
        <li className="auth-step" key={step.title}>
          <span className="auth-step__icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {step.icon}
            </svg>
          </span>
          <span className="auth-step__copy">
            <b>{step.title}</b>
            <span>{step.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
