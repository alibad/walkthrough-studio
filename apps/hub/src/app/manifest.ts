import type { MetadataRoute } from "next";
export default function manifest():MetadataRoute.Manifest{return {name:"Walkthrough Studio",short_name:"Walkthrough",description:"Evidence-based product documentation by Human Quest",start_url:"/",display:"standalone",background_color:"#faf8f5",theme_color:"#faf8f5",icons:[{src:"/favicon.svg",sizes:"any",type:"image/svg+xml"}]};}
