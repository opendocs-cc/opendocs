const { themes: prismThemes } = require("prism-react-renderer");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "OpenDocs",
  tagline: "Publish your agent's Markdown as links, PDF and Word files",
  favicon: "img/opendocs-icon.svg",
  url: "https://docs.opendocs.cc",
  baseUrl: "/",
  organizationName: "opendocs-cc",
  projectName: "opendocs",
  onBrokenLinks: "throw",
  trailingSlash: false,
  clientModules: [require.resolve("./src/fonts.js")],
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: require.resolve("./sidebars.js"),
        },
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      },
    ],
  ],
  themeConfig: {
    prism: {
      theme: prismThemes.github,
    },
    image: "img/opendocs-social-card.png",
    colorMode: {
      defaultMode: "light",
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: "OpenDocs",
      logo: {
        alt: "OpenDocs",
        src: "img/opendocs-icon.svg",
        href: "/",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          href: "https://opendocs.cc",
          label: "opendocs.cc",
          position: "right",
        },
        {
          href: "https://github.com/opendocs-cc/opendocs",
          label: "GitHub",
          position: "right",
        },
        {
          href: "https://opendocs.cc/signup",
          label: "Sign up",
          position: "right",
          className: "od-nav-cta",
        },
      ],
    },
    footer: {
      style: "light",
      links: [
        { label: "opendocs.cc", href: "https://opendocs.cc" },
        { label: "Pricing", href: "https://opendocs.cc/pricing" },
        { label: "Source on GitHub", href: "https://github.com/opendocs-cc/opendocs" },
        { label: "CLI on GitHub", href: "https://github.com/opendocs-cc/opendocs-cli" },
        { label: "llms.txt", href: "https://docs.opendocs.cc/llms.txt" },
        { label: "Privacy", href: "https://opendocs.cc/privacy" },
        { label: "Terms", href: "https://opendocs.cc/terms" },
      ],
      copyright: `© ${new Date().getFullYear()} OpenDocs`,
    },
    docs: {
      sidebar: {
        hideable: false,
        autoCollapseCategories: false,
      },
    },
  },
};

module.exports = config;
