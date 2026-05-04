import Link from "next/link";
import { ExpertiseMatrix } from "@/components/ExpertiseMatrix";
import {
  listAiRelationshipFacets,
  listExpertiseTagFacets,
  listMembers,
  listOpportunityAreaFacets,
  listSectorFacets,
} from "@/lib/committee";

export const metadata = {
  title: "Expertise — UCNFI",
  description:
    "Search and filter the UCNFI Steering Committee by expertise, opportunity area, sector, and AI relationship.",
};

export default function ExpertisePage() {
  const members = listMembers();
  const expertiseTagFacets = listExpertiseTagFacets();
  const opportunityAreaFacets = listOpportunityAreaFacets();
  const sectorFacets = listSectorFacets();
  const aiRelationshipFacets = listAiRelationshipFacets();

  return (
    <div className="pt-12">
      <header>
        <span className="label">UCNFI · Committee directory</span>
        <h1 className="display mt-2">
          Who&rsquo;s on the Steering Committee, and what they bring
        </h1>
        <p
          className="prose-body mt-4 max-w-2xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          Twenty-three members across campuses, health systems, national
          labs, and UCOP. This view lets you filter by expertise,
          opportunity area, sector, or how a member relates to AI &mdash;
          so you can see the shape of the committee and find the right
          people for a given question. Records are derived from public
          sources; member self-reports will reconcile against them.
        </p>
        <div className="mt-4">
          <Link href="/about" className="label">
            → About the committee and method
          </Link>
        </div>
      </header>

      <div className="mt-12">
        <ExpertiseMatrix
          members={members}
          expertiseTagFacets={expertiseTagFacets}
          opportunityAreaFacets={opportunityAreaFacets}
          sectorFacets={sectorFacets}
          aiRelationshipFacets={aiRelationshipFacets}
        />
      </div>
    </div>
  );
}
