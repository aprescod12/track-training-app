# Track & Field Training App

A cross-platform training application built for track and field athletes to organize track sessions, strength workouts, calendar events, performance history, and athlete-specific training data in one place.

The app is built with React Native, Expo, TypeScript, Expo Router, and Supabase. Its workflows are designed around the different data athletes need to record for track training and weight-room sessions rather than treating every workout as the same generic activity.

## Current Features

- Supabase authentication with persistent user sessions
- Separate track and lift workout logging flows
- Set, repetition, time, weight, and workout-note tracking
- Exercise search and support for custom exercises
- User-specific workout history stored in Supabase
- Recent-workout filtering across all, seven-day, and thirty-day views
- Monthly calendar combining workouts and manually added events
- Swipe and button navigation between calendar months
- Workout detail and exercise-history routes
- Personal-record evaluation and achievement-processing logic
- Profile, track-statistics, lift-statistics, overview, and training-hub routes
- Light and dark theme support
- Native and web-compatible session storage

## Application Structure

The application uses Expo Router for file-based navigation.

### Primary tabs

- **Home** — athlete dashboard and entry point
- **Calendar** — month-based workout and event planning
- **Workouts** — workout history, filtering, and logging
- **Friends** — social section within the main tab structure
- **Profile** — athlete information, statistics, and training tools

### Supporting routes

The stack also includes authentication, workout logging, workout details, exercise history, calendar-event creation, profile editing, lift statistics, track statistics, an athlete overview, and a training hub.

## Workout Logging

The logging workflow supports two distinct workout types:

### Track workouts

Track entries can record exercises, sets, repetitions, individual repetition times, optional resistance, and notes.

### Lift workouts

Lift entries can record exercises, set-by-set repetitions, weights, and notes.

The form supports multiple exercises in one workout, exercise suggestions, custom exercise creation, save feedback, personal-record checks, and achievement-processing hooks.

## Calendar and History

The calendar queries the authenticated user's workouts and calendar events for the selected month. It distinguishes track and lift activity, supports individual-day views, and allows users to add events for selected dates.

The workout-history screen identifies the current day's workout, displays recent sessions, and filters prior workouts by date range. All workout queries are scoped to the authenticated user.

## Architecture

- **Frontend:** React Native with Expo and TypeScript
- **Navigation:** Expo Router with stack, tab, modal, and dynamic routes
- **Backend:** Supabase authentication and database services
- **Session persistence:** AsyncStorage on native platforms and localStorage on the web
- **State and UI:** React hooks, reusable form components, and a shared theme system
- **Domain utilities:** Separate modules for exercises, dates, personal records, achievements, and Supabase access

## Technology Stack

- React Native
- Expo
- TypeScript
- Expo Router
- React Navigation
- Supabase
- AsyncStorage
- Expo Notifications
- Expo Image Picker

## Getting Started

### Prerequisites

- Node.js and npm
- Expo Go, an Android emulator, an iOS simulator, or a web browser
- A Supabase project configured with the database schema expected by the application

### Installation

```bash
git clone https://github.com/aprescod12/track-training-app.git
cd track-training-app
npm install
```

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Start the development server:

```bash
npm start
```

The Expo development menu can then open the app in Expo Go, an Android emulator, an iOS simulator, or a browser.

## Available Scripts

```bash
npm start
npm run android
npm run ios
npm run web
npm run lint
```

## Repository Organization

```text
app/          Expo Router screens and route layouts
components/   Reusable interface and form components
lib/          Supabase, theme, date, exercise, PR, and achievement utilities
assets/       Static application assets
```

## Project Purpose

This project combines software development with firsthand experience in track and field. It explores how athlete-specific workflows, structured training data, and accessible mobile interfaces can make workout planning and performance review more useful than a generic fitness log.
