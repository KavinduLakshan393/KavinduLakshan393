const fs = require("fs/promises");

const USERNAME = process.env.README_USERNAME || process.env.GITHUB_REPOSITORY_OWNER || "KavinduLakshan393";
const TOKEN = process.env.GITHUB_TOKEN || "";

const TEMPLATE_FILE = "README.template.md";
const OUTPUT_FILE = "README.md";

const headers = {
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "profile-readme-updater"
};

if (TOKEN) {
  headers.Authorization = `Bearer ${TOKEN}`;
}

async function githubFetch(url) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}\n${text}`);
  }

  return response.json();
}

function replaceSection(content, markerName, newContent) {
  const start = `<!-- ${markerName}:START -->`;
  const end = `<!-- ${markerName}:END -->`;

  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "m");

  if (!pattern.test(content)) {
    throw new Error(`Missing marker section: ${markerName}`);
  }

  return content.replace(pattern, `${start}\n${newContent.trim()}\n${end}`);
}

function formatDateUTC(date = new Date()) {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function buildProfileTable(user, repos) {
  const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);

  return `
| Metric | Value |
|---|---:|
| Public Repositories | ${user.public_repos ?? repos.length} |
| Followers | ${user.followers ?? 0} |
| Following | ${user.following ?? 0} |
| Total Public Repo Stars | ${totalStars} |
| Total Public Repo Forks | ${totalForks} |
| Last Auto Update | ${formatDateUTC()} |
`;
}

function buildLatestRepos(repos) {
  const filteredRepos = repos
    .filter((repo) => !repo.fork)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 6);

  if (filteredRepos.length === 0) {
    return "- No public repositories found.";
  }

  return filteredRepos
    .map((repo) => {
      const description = repo.description || "No description provided yet.";
      const language = repo.language || "Mixed";
      const stars = repo.stargazers_count || 0;
      const forks = repo.forks_count || 0;

      return `- [**${repo.name}**](${repo.html_url}) - ${description}<br />\`${language}\` | ⭐ ${stars} | 🍴 ${forks}`;
    })
    .join("\n");
}

async function getAllRepos() {
  const repos = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}&sort=updated&direction=desc`;
    const batch = await githubFetch(url);

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    repos.push(...batch);

    if (batch.length < 100) {
      break;
    }

    page += 1;
  }

  return repos;
}

async function main() {
  const [template, user, repos] = await Promise.all([
    fs.readFile(TEMPLATE_FILE, "utf8"),
    githubFetch(`https://api.github.com/users/${USERNAME}`),
    getAllRepos()
  ]);

  let readme = template;

  readme = replaceSection(readme, "PROFILE-DATA", buildProfileTable(user, repos));
  readme = replaceSection(readme, "LATEST-REPOS", buildLatestRepos(repos));

  await fs.writeFile(OUTPUT_FILE, readme, "utf8");

  console.log(`README.md updated successfully for ${USERNAME}`);
  console.log(`Public repositories fetched: ${repos.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
