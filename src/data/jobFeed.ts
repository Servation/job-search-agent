/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Job, JobTypeType } from '../types';

export interface BaseJobTemplate {
  title: string;
  company: string;
  location: string;
  salary: string;
  type: JobTypeType;
  isW2: boolean;
  description: string;
  skillsRequired: string[];
  url: string;
  industry?: string;
  experienceLevel?: 'Junior' | 'Mid' | 'Senior' | 'Lead';
  isRemote?: boolean;
  salaryNum?: number;
}

// A dynamic high-fidelity job catalog that generates items posted within the last 24h
export const fallbackJobPool: BaseJobTemplate[] = [
  {
    title: "Senior Full Stack Engineer (React & TypeScript)",
    company: "Linear Technologies",
    location: "Remote (US)",
    salary: "$140,000 - $180,000",
    type: "Full-Time",
    isW2: true,
    description: "Looking for an experienced engineer to build collaborative canvas tools and optimize client-side state engines. Proficient in React, Node.js, and tailwind.css.",
    skillsRequired: ["React", "TypeScript", "Node.js", "Tailwind CSS", "State Management"],
    url: "https://linear.app/careers/fullstack",
    industry: "technology",
    experienceLevel: "Senior",
    isRemote: true,
    salaryNum: 140000
  },
  {
    title: "Contract Web Developer (Tailwind & Next.js)",
    company: "Stripe",
    location: "San Francisco, CA / Remote",
    salary: "$95 - $120 / hr",
    type: "Contract",
    isW2: false,
    description: "Seeking a React expert for a 6-month contract to launch new interactive checkout dashboards. Must have a pristine eye for elegant CSS transitions and micro-interactions.",
    skillsRequired: ["Next.js", "React", "Tailwind CSS", "UI Design", "Framer Motion"],
    url: "https://stripe.com/jobs/contracts/webdev",
    industry: "technology",
    experienceLevel: "Mid",
    isRemote: true,
    salaryNum: 190000
  },
  {
    title: "AI Integrations Engineer",
    company: "Scale AI",
    location: "San Francisco, CA",
    salary: "$160,000 - $210,000 + equity",
    type: "Full-Time",
    isW2: true,
    description: "Implement orchestration layer flows using Gemini SDKs, local Ollama nodes, and vector directories. Help scale evaluation pipelines for high-capacity language modules.",
    skillsRequired: ["Gemini API", "Python", "TypeScript", "LLM Orchestration", "Vector Databases"],
    url: "https://scale.com/careers/ai-integrations",
    industry: "technology",
    experienceLevel: "Lead",
    isRemote: false,
    salaryNum: 160000
  },
  {
    title: "W2 Contracting Front-End Engineer",
    company: "Google",
    location: "Mountain View, CA / Hybrid",
    salary: "$85 - $105 / hr",
    type: "Contract",
    isW2: true,
    description: "Join the core design systems organization on a long-term W2 contract. Assist in refactoring and packaging modular UI components with high performance metrics.",
    skillsRequired: ["JavaScript", "React", "TypeScript", "Design Systems", "Web Performance"],
    url: "https://careers.google.com/jobs/frontend-w2",
    industry: "technology",
    experienceLevel: "Mid",
    isRemote: false,
    salaryNum: 170000
  },
  {
    title: "Data Visualization Analyst & Developer",
    company: "Supabase",
    location: "Remote (Global)",
    salary: "$110,000 - $140,000",
    type: "Full-Time",
    isW2: true,
    description: "Build robust data visualization layers using Recharts, D3, and Next.js. Create sleek developer-focused analytics boards and performance tracking metrics.",
    skillsRequired: ["D3.js", "Recharts", "SQL", "React", "Tailwind CSS"],
    url: "https://supabase.com/careers/data-viz",
    industry: "technology",
    experienceLevel: "Senior",
    isRemote: true,
    salaryNum: 110000
  },
  {
    title: "Junior Frontend Architect",
    company: "Vercel",
    location: "Remote (EU/US)",
    salary: "$90,000 - $120,000",
    type: "Full-Time",
    isW2: true,
    description: "Support our core components group in compiling responsive design libraries. Help optimize server-side rendering protocols and bundle footprints.",
    skillsRequired: ["React", "CSS Grid", "TypeScript", "Vite", "Hydration Performance"],
    url: "https://vercel.com/careers/junior-architect",
    industry: "technology",
    experienceLevel: "Junior",
    isRemote: true,
    salaryNum: 90000
  },
  {
    title: "Contract DevOps Specialist (AWS & Docker)",
    company: "Coinbase",
    location: "New York, NY / Remote",
    salary: "$110 - $140 / hr",
    type: "Contract",
    isW2: false,
    description: "Part-time or Full-time contract to migrate existing task schedulers into containerized, high-availability Cloud Run endpoints. Strong focus on security isolation.",
    skillsRequired: ["AWS", "Docker", "CI/CD", "Terraform", "Cloud Run"],
    url: "https://coinbase.com/careers/devops-contract",
    industry: "technology",
    experienceLevel: "Senior",
    isRemote: true,
    salaryNum: 220000
  },
  {
    title: "Product Manager (Developer Platforms)",
    company: "GitHub",
    location: "Remote (US)",
    salary: "$150,000 - $190,000",
    type: "Full-Time",
    isW2: true,
    description: "Lead product discovery for developer-first workflows, collaborative AI modules, and integration sandboxes. Drive telemetry standards.",
    skillsRequired: ["Product Management", "Developer Experience", "Agile", "Telemetry", "Git"],
    url: "https://github.com/careers/pm-dev-platform",
    industry: "technology",
    experienceLevel: "Lead",
    isRemote: true,
    salaryNum: 150000
  },
  {
    title: "Python Back-End Contractor (W2)",
    company: "JP Morgan Chase",
    location: "Chicago, IL / Hybrid",
    salary: "$150,000",
    type: "Contract",
    isW2: true,
    description: "Contractor position for transactional banking team. Build secure parser APIs using FastAPI, handle duplicate account detection databases, and run background scheduling processes.",
    skillsRequired: ["Python", "FastAPI", "PostgreSQL", "Unit Testing", "Microservices"],
    url: "https://jpmorgan.com/careers/python-w2",
    industry: "finance",
    experienceLevel: "Mid",
    isRemote: false,
    salaryNum: 150000
  },
  {
    title: "Medical IT Systems Analyst",
    company: "One Medical",
    location: "Remote (US)",
    salary: "$105,000 - $125,000",
    type: "Full-Time",
    isW2: true,
    description: "Maintain and configure medical records flow. Strong integration background with clinic telemetry APIs, SQL schemas, and healthcare security standards HIPAA.",
    skillsRequired: ["HIPAA", "SQL", "HL7", "Epic EMR", "API Integrations"],
    url: "https://careers.onemedical.com/medical-analyst",
    industry: "healthcare",
    experienceLevel: "Mid",
    isRemote: true,
    salaryNum: 105000
  },
  {
    title: "Senior Healthcare Data Engineer",
    company: "Moderna Therapeutics",
    location: "Boston, MA / Remote",
    salary: "$165,000 - $185,000",
    type: "Full-Time",
    isW2: true,
    description: "Construct reliable clinical dataset pipelines for active research teams. Python, AWS, and secure file handling under HIPAA and biotech industry specs.",
    skillsRequired: ["AWS", "Python", "SQL", "Data Pipelines", "Docker"],
    url: "https://moderna.com/careers/healthcare-data-engineer",
    industry: "healthcare",
    experienceLevel: "Senior",
    isRemote: true,
    salaryNum: 165000
  },
  {
    title: "Senior Quantitative C++ Developer",
    company: "Citadel LLC",
    location: "New York, NY",
    salary: "$185,000 - $250,050",
    type: "Full-Time",
    isW2: true,
    description: "Build ultra-low latency real-time transactional financial models. Ensure top data ingestion streaming with extreme safety and performance requirements.",
    skillsRequired: ["C++", "Python", "Trading Systems", "React", "Low Latency"],
    url: "https://citadel.com/careers/quant-cpp",
    industry: "finance",
    experienceLevel: "Senior",
    isRemote: false,
    salaryNum: 185000
  },
  {
    title: "WealthTech Front-End Analyst",
    company: "Betterment",
    location: "Remote (US)",
    salary: "$85,000 - $110,000",
    type: "Full-Time",
    isW2: true,
    description: "Construct interactive visual charting components using Recharts, Tailwind systems, and React framework. Focus on high-fidelity responsive performance.",
    skillsRequired: ["TypeScript", "React", "Tailwind CSS", "Recharts", "D3.js"],
    url: "https://betterment.com/jobs/wealthtech-frontend",
    industry: "finance",
    experienceLevel: "Junior",
    isRemote: true,
    salaryNum: 85000
  },
  {
    title: "Lead UI Designer & Framer motion Developer",
    company: "Design Systems LLC",
    location: "Los Angeles, CA / Remote",
    salary: "$115,000 - $145,000",
    type: "Full-Time",
    isW2: true,
    description: "Formulate breathtaking responsive interactive visual interfaces. Must have mastery of layout animations, spring curves, custom typography, and deep light themes.",
    skillsRequired: ["Framer Motion", "UI/UX Design", "Figma", "Tailwind CSS", "Typography"],
    url: "https://designsystems.llc/careers/lead-designer",
    industry: "technology",
    experienceLevel: "Lead",
    isRemote: true,
    salaryNum: 115000
  }
];

export const generateDynamicFeed = (resumeSkills: string[] = []): Job[] => {
  const currentHour = new Date().getHours();
  return fallbackJobPool.map((tpl, i) => {
    // calculate a realistic match score based on skill intersection
    const matchingSkills = tpl.skillsRequired.filter(s => 
      resumeSkills.some(rs => rs.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(rs.toLowerCase()))
    );
    const skillRatio = tpl.skillsRequired.length > 0 ? matchingSkills.length / tpl.skillsRequired.length : 0.5;
    const baseScore = Math.floor(40 + (skillRatio * 50) + (Math.random() * 10));
    const matchScore = Math.min(100, Math.max(30, baseScore));

    // dynamic realistic relative timestamps within past 24 hours
    const hourDelta = Math.max(1, Math.floor(((i * 2.3) + currentHour) % 23));
    
    return {
      id: `local-match-${Date.now()}-${i}`,
      title: tpl.title,
      company: tpl.company,
      location: tpl.location,
      salary: tpl.salary,
      type: tpl.type,
      isW2: tpl.isW2,
      description: tpl.description,
      url: tpl.url,
      postedAt: `${hourDelta} ${hourDelta === 1 ? 'hour' : 'hours'} ago`,
      scannedAt: new Date(Date.now() - hourDelta * 60 * 60 * 1000).toISOString(),
      matchScore,
      matchReason: matchingSkills.length > 0 
        ? `Solid alignment with your skills in ${matchingSkills.join(', ')}. Strong company pedigree.`
        : `Matches your professional target role parameters with a versatile full-stack scope.`,
      isDuplicate: false,
      status: 'discovered',
      skillsRequired: tpl.skillsRequired,
      industry: tpl.industry,
      experienceLevel: tpl.experienceLevel,
      isRemote: tpl.isRemote,
      salaryNum: tpl.salaryNum,
    };
  });
};
