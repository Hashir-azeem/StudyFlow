import type { AssessmentDraft } from "../types/assessment";
import type { Assessment } from "../types/assessment";
import type { ID } from "../types/ids";
import { adapter } from "../storage";

export const assessmentService = {
  list(filter?: Parameters<typeof adapter.listAssessments>[0]) {
    return adapter.listAssessments(filter);
  },
  create(draft: AssessmentDraft) {
    return adapter.createAssessment(draft);
  },
  update(id: ID, patch: Partial<AssessmentDraft>) {
    return adapter.updateAssessment(id, patch);
  },
  setStatus(id: ID, status: Assessment["status"]) {
    return adapter.setAssessmentStatus(id, status);
  },
};
