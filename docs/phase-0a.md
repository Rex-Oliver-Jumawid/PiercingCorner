# Phase 0A — Project scaffold

This phase establishes the frontend foundation only: Vite, React, TypeScript,
Tailwind, routing, TanStack Query, Zustand availability, and a lazy Supabase
client boundary. The placeholder routes deliberately contain no business logic.

The `supabase/migrations` directory is reserved for the Phase 0B database schema
and Row Level Security work. It is not linked to a remote Supabase project.

Future domain work should remain feature-local. In particular, the transaction
workflow belongs in its own feature rather than an application-wide component.
Application access remains limited to `owner` and `staff`; service qualifications
such as piercer are separate studio-domain data.
