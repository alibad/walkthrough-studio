import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import {getProjects,getCatalog,getPersonas,getPersonaJourneys} from "@/lib/data";
export default function sitemap():MetadataRoute.Sitemap {
 const routes=["/","/use","/setup"];
 for(const p of getProjects()){ const slug=encodeURIComponent(p.slug);routes.push(`/${slug}`,`/${slug}/issues`);for(const f of getCatalog(p.slug)?.features||[])routes.push(`/${slug}/features/${encodeURIComponent(f.featureId)}`);for(const persona of getPersonas(p.slug)){ const base=`/${slug}/personas/${encodeURIComponent(persona.id)}`;routes.push(base);for(const j of getPersonaJourneys(p.slug,persona.id))routes.push(`${base}/journeys/${encodeURIComponent(j.journeyId)}`);}}
 return routes.map(route=>({url:SITE_URL+route}));
}
