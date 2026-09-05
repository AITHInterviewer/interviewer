import { CANDIDATE_STEPS, type CandidateStep } from "@/lib/candidate-flow";

/** Три шага подготовки: только на экранах до/во время интервью, не на done/extra/expired/request. */
export function CandidatePrepProgress({ current }: { current: CandidateStep }) {
  const currentIndex = CANDIDATE_STEPS.indexOf(current);

  return (
    <nav className="candidate-prep-progress" aria-label="Подготовка к интервью">
      <ol>
        {CANDIDATE_STEPS.map((step, index) => (
          <li
            key={step}
            aria-current={step === current ? "step" : undefined}
            data-active={step === current ? "true" : undefined}
            data-done={index < currentIndex ? "true" : undefined}
          >
            {step}
          </li>
        ))}
      </ol>
    </nav>
  );
}
