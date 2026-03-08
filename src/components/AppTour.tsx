import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Shepherd from "shepherd.js";
import "shepherd.js/dist/css/shepherd.css";
import { useOnboarding } from "@/hooks/useOnboarding";
import { TOUR_STEPS } from "@/lib/onboarding-data";

const SHEPHERD_STYLES = `
  .shepherd-element {
    background: hsl(220, 18%, 13%) !important;
    border: 1px solid hsl(172, 83%, 33%) !important;
    border-radius: 8px !important;
    max-width: 380px !important;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;
  }
  .shepherd-header {
    background: transparent !important;
    padding: 16px 16px 4px !important;
  }
  .shepherd-title {
    font-family: 'Instrument Serif', Georgia, serif !important;
    font-size: 18px !important;
    color: hsl(210, 20%, 93%) !important;
    font-weight: 400 !important;
  }
  .shepherd-text {
    font-family: 'IBM Plex Sans', system-ui, sans-serif !important;
    font-size: 14px !important;
    color: hsl(215, 10%, 55%) !important;
    line-height: 1.6 !important;
    padding: 8px 16px 16px !important;
  }
  .shepherd-footer {
    padding: 0 16px 16px !important;
  }
  .shepherd-button {
    border-radius: 6px !important;
    font-family: 'IBM Plex Sans', system-ui, sans-serif !important;
    font-size: 13px !important;
    padding: 6px 16px !important;
  }
  .shepherd-button-primary {
    background: hsl(172, 83%, 33%) !important;
    color: white !important;
  }
  .shepherd-button-primary:hover {
    background: hsl(172, 83%, 28%) !important;
  }
  .shepherd-button-secondary {
    background: transparent !important;
    color: hsl(215, 10%, 55%) !important;
  }
  .shepherd-modal-overlay-container {
    fill: rgba(0,0,0,0.6) !important;
  }
  .shepherd-has-cancel-icon .shepherd-cancel-icon {
    color: hsl(215, 10%, 55%) !important;
  }
`;

type ShepherdButton = {
  text: string;
  action: () => void;
  classes: string;
};

type ShepherdStepOptions = {
  id: string;
  title: string;
  text: string;
  buttons: ShepherdButton[];
  attachTo?: { element: string; on: string };
};

export function AppTour({ autoStart = false }: { autoStart?: boolean }) {
  const navigate = useNavigate();
  const { updateProgress } = useOnboarding();
  const tourRef = useRef<any>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const startTour = useCallback(() => {
    if (tourRef.current?.isActive) return;

    if (!styleRef.current) {
      styleRef.current = document.createElement("style");
      styleRef.current.textContent = SHEPHERD_STYLES;
      document.head.appendChild(styleRef.current);
    }

    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        scrollTo: true,
        cancelIcon: { enabled: true },
      },
    });

    TOUR_STEPS.forEach((step, i) => {
      const isLast = i === TOUR_STEPS.length - 1;
      const buttons: ShepherdButton[] = [];

      if (i > 0) {
        buttons.push({ text: "Back", action: () => tour.back(), classes: "shepherd-button-secondary" });
      }
      buttons.push({
        text: isLast ? "Start my research →" : "Next",
        action: () => {
          if (isLast) tour.complete();
          else tour.next();
        },
        classes: "shepherd-button-primary",
      });

      const stepOptions: ShepherdStepOptions = {
        id: step.id,
        title: step.title,
        text: step.text,
        buttons,
      };

      if (step.attachTo) {
        stepOptions.attachTo = { element: step.attachTo, on: "bottom" };
      }

      tour.addStep(stepOptions as any);
    });

    tour.on("complete", async () => {
      await updateProgress({ tour_completed: true, completed_at: new Date().toISOString() });
    });

    tour.on("cancel", async () => {
      await updateProgress({ tour_completed: true, completed_at: new Date().toISOString() });
    });

    tourRef.current = tour;
    tour.start();
  }, [updateProgress]);

  useEffect(() => {
    if (autoStart) {
      const timer = setTimeout(() => startTour(), 500);
      return () => clearTimeout(timer);
    }
  }, [autoStart, startTour]);

  useEffect(() => {
    (window as any).__startAppTour = startTour;
    return () => { delete (window as any).__startAppTour; };
  }, [startTour]);

  return null;
}
