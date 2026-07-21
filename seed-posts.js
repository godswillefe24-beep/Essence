import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const postsDir = path.join(__dirname, 'posts');
const postsFile = path.join(__dirname, 'data', 'posts.json');

// Sample posts data with titles and categories
const posts = [
  {
    id: 'post1',
    slug: 'post1',
    title: 'Welcome to my blog',
    category: 'Writing',
    date: new Date('2026-01-15').toISOString(),
    excerpt: 'Explore insights on blogging, content creation, and digital storytelling. Learn the basics of starting your own blog.'
  },
  {
    id: 'post2',
    slug: 'post2',
    title: 'Latest Technology News and Innovations',
    category: 'Code, Ideas',
    date: new Date('2026-02-20').toISOString(),
    excerpt: 'Discover the latest technology trends, innovations, and developments in the tech industry.'
  },
  {
    id: 'post3',
    slug: 'post3',
    title: 'Getting Started with Your Blog',
    category: 'Writing, Design',
    date: new Date('2026-03-10').toISOString(),
    excerpt: 'A comprehensive guide to starting your own blog, from planning to launching your first post.'
  },
  {
    id: 'post4',
    slug: 'post4',
    title: 'Advanced Customization Techniques',
    category: 'Tutorial',
    date: new Date('2026-03-25').toISOString(),
    excerpt: 'Master CSS Grid, custom properties, and JavaScript for professional web design.'
  },
  {
    id: 'post5',
    slug: 'post5',
    title: 'How Computers Are Made',
    category: 'Technology',
    date: new Date('2026-04-05').toISOString(),
    excerpt: 'At some point, everyone looks at a computer and thinks: "There is no way this thing runs on just 0s and 1s." But yes, it absolutely does.'
  },
  {
    id: 'post6',
    slug: 'post6',
    title: 'The Biggest Tech Trends Defining 2026',
    category: 'Ideas, Code',
    date: new Date('2026-04-15').toISOString(),
    excerpt: 'An in-depth look at the most significant technology trends and innovations shaping 2026.'
  },
  {
    id: 'post7',
    slug: 'post7',
    title: 'Latest Technology Trends Shaping the Future in 2026',
    category: 'Ideas',
    date: new Date('2026-04-22').toISOString(),
    excerpt: 'Explore the future of technology with insights into emerging trends and innovations.'
  },
  {
    id: 'post8',
    slug: 'post8',
    title: 'Content is King: The Art of Great Writing',
    category: 'Writing, Design',
    date: new Date('2026-05-01').toISOString(),
    excerpt: 'Master the art of content creation and discover how to write compelling, engaging articles.'
  }
];

// Write to posts.json
fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2));
console.log(`✓ Seeded ${posts.length} posts to posts.json`);
console.log('Posts with categories:', posts.map(p => `${p.title} (${p.category})`).join('\n  '));
