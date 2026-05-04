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
    <div className="pt-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <span className="label">UCNFI · Committee directory</span>
          <h1 className="display mt-2">
            Who&rsquo;s on the Steering Committee, and what they bring
          </h1>
        </div>
        <Link href="/about" className="label">
          → Method
        </Link>
      </header>

      <div className="mt-8">
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
