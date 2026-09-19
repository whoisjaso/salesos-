import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import {
  CalendarCheck,
  Package,
  PhoneCall,
  Plant,
  Receipt,
  Scales,
  Signpost,
  Tray,
  UserCheck,
} from "@phosphor-icons/react/dist/ssr";

export interface StageSpec {
  /** Matches `SopModule.stage`. */
  stage: string;
  label: string;
  icon: ComponentType<IconProps>;
}

/** Workflow order. One icon per stage so the rail reads without labels on a narrow screen. */
export const STAGES: StageSpec[] = [
  { stage: "intake", label: "Intake", icon: Tray },
  { stage: "contact", label: "Contact", icon: PhoneCall },
  { stage: "booking", label: "Booking", icon: CalendarCheck },
  { stage: "attendance", label: "Attendance", icon: UserCheck },
  { stage: "fit", label: "Fit", icon: Scales },
  { stage: "decision", label: "Decision", icon: Signpost },
  { stage: "collection", label: "Collection", icon: Receipt },
  { stage: "delivery", label: "Delivery", icon: Package },
  { stage: "nurture", label: "Nurture", icon: Plant },
];
