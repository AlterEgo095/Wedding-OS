-- P2.8: Add maxInvitationsPerMonth to Organization for org-level invitation quota
ALTER TABLE "Organization" ADD COLUMN "maxInvitationsPerMonth" INTEGER NOT NULL DEFAULT 50;
