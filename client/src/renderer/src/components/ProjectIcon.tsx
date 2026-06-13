// Original, minimal monogram marks for the cheat projects (NOT the real brand
// logos — those are copyrighted). Each is a simple geometric glyph in the
// project's signature colour, so it reads at a glance and stays free to use.
import type { CheatProject } from '@sephraxia/shared';

export const PROJECT_COLOR: Record<string, string> = {
  skeet: '#95b607',
  neverlose: '#3e7bdb',
  fatality: '#e0913a',
  pandora: '#c264e0',
  monolith: '#9aa3b2',
};

export const PROJECT_LABEL: Record<string, string> = {
  skeet: 'skeet.cc',
  neverlose: 'neverlose.cc',
  fatality: 'fatality.win',
  pandora: 'pandora.zone',
  monolith: 'monolith',
};

function Glyph({ project, c }: { project: string; c: string }) {
  switch (project) {
    case 'skeet': // leaf-ish wedge
      return <path d="M5 19c2-9 7-13 14-14-1 9-6 13-14 14z M9 15c2-3 4-5 7-6" />;
    case 'neverlose': // interlocked N strokes
      return <path d="M6 18V6l12 12V6 M6 6l12 12" />;
    case 'fatality': // angular F / blade
      return <path d="M7 4h10l-3 4h-4v3h6l-3 4h-3v5l-3-2z" />;
    case 'pandora': // opening box / lid ajar
      return <path d="M5 11l7-5 7 5v8H5z M5 11l7 4 7-4 M9 4l3 2 3-2" />;
    case 'monolith': // standing slab + base
      return <path d="M9 3h6v15H9z M6 18h12 M12 6v9" />;
    default:
      return <circle cx="12" cy="12" r="7" />;
  }
}

export function ProjectIcon({ project, size = 18 }: { project: string; size?: number }) {
  const c = PROJECT_COLOR[project] ?? '#7d6fc4';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={project}
    >
      <Glyph project={project} c={c} />
    </svg>
  );
}

/** A pill: monogram + project name, in the project colour. */
export function ProjectChip({ project }: { project: string }) {
  const c = PROJECT_COLOR[project] ?? '#7d6fc4';
  const label = PROJECT_LABEL[project] ?? project;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: `${c}1c`, color: c, border: `1px solid ${c}55`, textTransform: 'none' }}
      title={label}
    >
      <ProjectIcon project={project} size={14} />
      {label}
    </span>
  );
}

export const KNOWN_PROJECTS: CheatProject[] = ['skeet', 'neverlose', 'fatality', 'pandora', 'monolith'];
