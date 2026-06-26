import React from 'react';

const EXAMPLE_PROMPTS = [
  {
    icon: 'i-ph:layout',
    title: 'SaaS Dashboard',
    description: 'Analytics dashboard with charts and dark mode',
    prompt: `Create a modern SaaS analytics dashboard using React, Vite, and TypeScript with Tailwind CSS and Recharts.

Pages: Dashboard overview, Analytics detail view, Settings page with profile section.

Components: Sidebar navigation with collapsible menu items and active state indicators, TopBar with search input, notification bell with badge count, and user avatar dropdown, StatCard showing metric value, percentage change with up/down arrow, and sparkline mini-chart, AreaChart for revenue over time (12 months of data), BarChart for user signups by month, DonutChart for traffic sources breakdown, DataTable with sortable columns, pagination, and row selection checkboxes, ActivityFeed showing recent events with timestamps and user avatars.

Data: Populate with realistic SaaS metrics — MRR ($48,750 +12.5%), Active Users (2,847 +8.3%), Churn Rate (3.2% -0.5%), NPS Score (72 +4). Include 12 months of revenue data trending upward with seasonal dips, a table of 15 recent transactions with company names, amounts, and status badges (Completed/Pending/Failed).

Design: Dark mode by default with a deep navy sidebar (#0f172a), cards with subtle glass effect and soft borders, accent color electric blue (#3b82f6) for charts and active states. Use Inter font. Smooth hover transitions on all interactive elements. Responsive — sidebar collapses to icons on tablet, becomes bottom nav on mobile.`,
  },
  {
    icon: 'i-ph:storefront',
    title: 'E-commerce Store',
    description: 'Product store with cart, filtering, and checkout',
    prompt: `Build a complete e-commerce storefront using React, Vite, TypeScript, and Tailwind CSS with React Router for navigation.

Pages: Home with hero banner and featured products, Product listing with filters, Product detail with image gallery, Shopping cart, Checkout flow (shipping → payment → confirmation).

Components: ProductCard with image, title, price, rating stars, and "Add to Cart" button with quantity animation, ImageGallery with thumbnail strip and main image zoom on hover, FilterSidebar with category checkboxes, price range slider, rating filter, and color swatches, CartDrawer sliding in from right showing items with quantity controls and running total, CheckoutForm with shipping address fields, card input UI (non-functional but realistic), and order summary, SearchBar with autocomplete dropdown showing product suggestions, NavigationBar with logo, category links, search, cart icon with item count badge.

Data: Create 12 products across 3 categories (Electronics, Clothing, Home) with realistic names, descriptions, prices ($29.99-$599.99), ratings (3.5-5.0), and product images from Pexels. Each product needs 3-4 gallery images.

Interactions: Add to cart with optimistic count update and toast notification, real-time cart total calculation with tax, filter products by category/price/rating with URL query params, quantity +/- controls in cart with stock limit validation, remove from cart with undo toast.

Design: Clean white background with warm accent colors (amber/orange for CTAs), large product images with subtle shadow on hover and scale transform, pill-shaped category filters, sticky header that shrinks on scroll. Mobile-first with responsive grid (1 col mobile, 2 tablet, 3-4 desktop). Use Plus Jakarta Sans font.`,
  },
  {
    icon: 'i-ph:game-controller',
    title: 'Interactive Game',
    description: '2D platformer with Canvas and controls',
    prompt: `Build a 2D platformer game using HTML5 Canvas, vanilla TypeScript, and Vite with the following game design:

Game Mechanics: Player character that can run left/right and jump with variable jump height (hold longer = jump higher), gravity physics with smooth acceleration, platform collision detection (land on top, block from sides), coin collection with score tracking, enemy patrol AI (walks back and forth on platforms), player health system (3 hearts, lose 1 on enemy contact), invincibility frames after taking damage with flashing effect.

Levels: Design 1 complete level with 5+ platforms at varying heights, 10 collectible coins placed strategically, 3 patrolling enemies, a visible goal flag at the end. Include a parallax scrolling background with 3 layers (mountains, trees, clouds).

UI: Title screen with "Press SPACE to Start" prompt and high score display, in-game HUD showing score, coin count, health hearts, and level timer, pause menu (press ESC) with Resume/Restart options, Game Over screen with final score, time, and "Play Again" button, Victory screen when reaching the goal.

Controls: Arrow keys or WASD for movement, Space for jump, mobile touch controls with virtual D-pad and jump button for touchscreen devices.

Visuals: Use simple geometric shapes with vibrant colors — blue square player, green rectangle platforms, yellow circle coins, red triangle enemies. Smooth 60fps animation loop. Screen shake on damage, particle burst on coin collection. Gradient sky background transitioning from light blue to orange (sunset feel).

Technical: Proper game loop with delta time, entity component pattern, separated rendering from logic, requestAnimationFrame for smooth animation.`,
  },
  {
    icon: 'i-ph:chat-circle-dots',
    title: 'Chat Application',
    description: 'Real-time chat with rooms and messaging',
    prompt: `Build a complete real-time chat application using React, Vite, and TypeScript with Tailwind CSS.

Pages: Login/Register screen with email and password, Chat room list (home), Active chat room view, User profile/settings page.

Components: ChatBubble with sent/received variants showing message text, timestamp, and delivery status (sent/delivered/read checkmarks), MessageInput with text field, emoji picker button (with emoji grid popover), file attachment button, and send button with enter-key support, TypingIndicator showing animated bouncing dots with "User is typing..." text, UserAvatar showing user image with online/offline status dot (green/gray), ChatRoomCard showing room name, last message preview, timestamp, unread count badge, and member avatars stack, UserListSidebar showing all members of current room with online status, SearchMessages component with search input that highlights matching messages, MessageGroup that groups consecutive messages from same sender.

State Management: React Context for authenticated user state, useReducer for messages array per room, localStorage for persisted session token and theme preference. Simulate real-time with setInterval adding new messages from mock users every 15-30 seconds.

Data: Create 5 chat rooms ("General", "Design Team", "Engineering", "Random", "Announcements") each with 15-25 realistic messages from 8 mock users. Users should have distinct names, avatar URLs from ui-avatars.com, and varied online statuses. Messages should include realistic conversation flows — questions, answers, reactions, links, and multi-line messages.

Features: Send messages with optimistic UI update and smooth scroll-to-bottom, typing indicator appears for 2-3 seconds when a simulated user is about to send a message, unread message badges update in real-time on room cards, search messages within current room with match highlighting, message timestamps using relative time (just now, 2m ago, 1h ago, Yesterday), user presence indicators with last seen time for offline users.

Design: Dark mode default with deep charcoal background (#1a1a2e), message bubbles with subtle gradient (sent: blue-purple gradient, received: dark glass), smooth entrance animation for new messages sliding up, glassmorphism effect on sidebar and header. Inter font. Fully responsive — mobile shows either room list or chat (not both), desktop shows sidebar + chat panel.`,
  },
  {
    icon: 'i-ph:article',
    title: 'Blog Platform',
    description: 'Blog with markdown, categories, and dark mode',
    prompt: `Create a full-featured blog platform using React, Vite, TypeScript, and Tailwind CSS with React Router.

Pages: Home page with hero section and featured/recent posts grid, Blog listing page with category filter and search, Individual blog post page with full content, About page with author bio and social links, Category archive page showing posts filtered by tag.

Components: PostCard with cover image, category badge, title, excerpt (2 lines), author avatar + name, publish date, and estimated read time, PostContent rendering markdown to HTML with styled headings, code blocks with syntax highlighting, blockquotes, images with captions, and embedded links, TableOfContents auto-generated from post headings as a sticky sidebar, AuthorBio card with avatar, name, bio, and social media icon links, CategoryBadge with distinct colors per category, NewsletterSignup form with email input and subscribe button with success state, ThemeToggle with smooth dark/light mode transition using CSS custom properties, RelatedPosts section showing 3 posts from same category, SearchBar with debounced search filtering posts by title and content.

Data: Write 8 complete blog posts across 4 categories (Technology, Design, Productivity, Career) with realistic titles, 200+ word excerpts, realistic author names, cover images from Pexels, publish dates spanning the last 3 months, and read times (4-12 min). Each post should have full markdown body content with headings, paragraphs, a code snippet, and a blockquote.

Design: Clean, magazine-style layout with generous whitespace. Light mode default with dark mode toggle. Typography-focused with serif font for post body (Merriweather), sans-serif for UI (Inter). Subtle hover lift on post cards with shadow transition. Category colors: Technology (blue), Design (purple), Productivity (green), Career (amber). Reading progress bar at top of post pages. Responsive masonry-style grid for post listing.`,
  },
  {
    icon: 'i-ph:device-mobile',
    title: 'Mobile App UI',
    description: 'Fitness tracker with workouts and progress',
    prompt: `Build a fitness tracker mobile app UI using React Native with Expo and TypeScript, styled with React Native's built-in StyleSheet.

Screens: Home dashboard with today's activity summary, Workout library with exercise categories, Active workout tracking screen, Progress/stats screen with weekly and monthly charts, Profile screen with goals and settings.

Components: ActivityRing showing daily progress as animated circular progress bars (calories, steps, active minutes) inspired by Apple Watch rings, WorkoutCard with exercise illustration icon, workout name, duration, calories burned, and difficulty badge, ExerciseListItem with muscle group icon, exercise name, sets x reps format, and rest timer, StatsChart showing weekly bar chart of workout minutes and monthly line chart of weight/body metrics, ProgressBar with animated fill and percentage label, TimerDisplay showing large countdown timer with start/pause/reset controls and lap tracking, GoalCard showing target vs current with circular progress and motivational message, BottomTabNavigator with Home, Workouts, Activity, Progress, and Profile tabs with active indicator.

Data: Create a week of workout history with 5 different workout types (Strength Training, HIIT, Yoga, Running, Swimming), each containing 4-8 exercises with sets, reps, and weight data. Include daily step counts (6,000-12,000), calorie burns (1,800-2,400), and active minutes (30-90). Create a user profile with goals (10,000 steps, 2,000 cal, 60 active min).

Interactions: Tap workout to expand exercise list with animation, start workout timer with haptic feedback simulation, swipe to dismiss completed exercises, pull-to-refresh on activity feed, animated ring fill on dashboard load.

Design: Dark theme with gradient accents (neon green #39FF14 to cyan #00E5FF for activity rings), card-based layout with rounded corners (16px) and subtle elevation shadows, large readable numbers for metrics, smooth spring animations on screen transitions. Use system font (San Francisco style).`,
  },
];

interface ExamplePromptsProps {
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
}

export function ExamplePrompts({ sendMessage }: ExamplePromptsProps) {
  return (
    <div id="examples" className="relative w-full max-w-2xl mx-auto mt-6 px-4 lg:px-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {EXAMPLE_PROMPTS.map((item, index) => (
          <button
            key={index}
            onClick={(event) => {
              sendMessage?.(event, item.prompt);
            }}
            className="landing-fade-in-up group flex flex-col items-start gap-2 p-3.5 rounded-xl border border-ui-borderColor bg-ui-background-depth-2 hover:border-ui-borderColorActive text-left transition-all duration-200 hover:shadow-sm cursor-pointer"
            style={{ animationDelay: `${0.15 + index * 0.06}s` }}
          >
            <span
              className={`${item.icon} text-xl text-ui-textTertiary group-hover:text-ui-button-primary-text transition-colors`}
            />
            <div>
              <div className="text-sm font-medium text-ui-textPrimary">{item.title}</div>
              <div className="text-xs text-ui-textTertiary mt-0.5 line-clamp-2">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
