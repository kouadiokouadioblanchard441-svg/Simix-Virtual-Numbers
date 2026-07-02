import { Helmet } from "react-helmet-async";

const SITE_NAME = "SIMIX";
const DEFAULT_IMAGE = "https://simix.site/opengraph.jpg";
const BASE_URL = "https://simix.site";

interface SeoMetaProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
}

export function SeoMeta({ title, description, path = "/", image = DEFAULT_IMAGE, noIndex = false }: SeoMetaProps) {
  const canonical = `${BASE_URL}${path}`;
  const fullTitle = title.toLowerCase().includes(SITE_NAME.toLowerCase()) ? title : `${title} — ${SITE_NAME}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="fr_FR" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
