export type Role = 'admin' | 'staff' | 'student';

export interface User {
  id: string; email: string; role: Role; firstName: string; lastName: string; phone?: string | null;
  avatarKey?: string | null; dob?: string | null; emergencyContact?: string | null;
  mustChangePassword: boolean; active: boolean; createdAt: string;
}

export interface Agency { id: number; code: string; name: string; logoKey?: string | null }

export interface Course {
  id: string; slug: string; name: string; agency?: string | null; agencyId?: number | null;
  category: 'recreational' | 'technical' | 'specialty' | 'professional';
  level: 'beginner' | 'intermediate' | 'advanced' | 'technical' | 'professional';
  priceCents: number; duration: string; summary: string; description: string; prerequisites: string; outcomes: string;
  faq: { q: string; a: string }[]; imageKey?: string | null; featured: boolean; active: boolean; sort: number;
  events?: Event[];
}

export type EventType = 'class' | 'dive_trip' | 'training_dive' | 'pool_session' | 'other';

export interface Instructor { id: string; firstName: string; lastName: string; avatarKey?: string | null }

export interface Event {
  id: string; type: EventType; title: string; description: string; location: string;
  startsAt: string; endsAt: string; capacity: number; taken: number; waitlisted: number; spotsLeft: number;
  priceCents: number; published: boolean; allowWaitlist: boolean; instructors: Instructor[];
  course?: { id: string; slug: string; name: string; imageKey?: string | null; level: string; category: string; agency?: string | null } | null;
  diveSite?: { id: string; slug: string; name: string } | null;
  myStatus?: EnrollmentStatus;
}

export type EnrollmentStatus = 'reserved' | 'waitlisted' | 'cancelled' | 'completed' | 'no_show';

export interface Enrollment {
  id: string; eventId: string; userId: string; status: EnrollmentStatus; amountCents: number;
  paidAt?: string | null; paidCents: number; notes: string; createdAt: string; user?: User;
}

export interface Staff {
  id: string; firstName: string; lastName: string; title: string; bio: string; certifications: string[]; agencies: string[]; photoKey?: string | null;
}

export interface StaffProfile { title: string; bio: string; certifications: string[]; agencies: string[]; photoKey?: string | null; public: boolean; sort: number }

export interface DiveSite {
  id: string; slug: string; name: string; location: string; description: string;
  difficulty: 'all' | 'beginner' | 'intermediate' | 'advanced' | 'technical'; lat?: number | null; lng?: number | null;
  imageKey?: string | null; active: boolean; sort: number;
}

export type PostCategory = 'news' | 'training_tips' | 'trip_reports' | 'equipment' | 'videos';
export interface Post {
  id: string; slug: string; title: string; category: PostCategory; excerpt: string; body?: string; coverKey?: string | null;
  publishedAt?: string | null; createdAt: string; author?: { firstName: string; lastName: string } | null;
}

export type Album = 'classes' | 'dive_sites' | 'travel' | 'videos' | 'other';
export interface Media {
  id: string; key: string; mime: string; width?: number | null; height?: number | null; title: string; caption: string;
  album: Album; videoUrl?: string | null; sort: number; public: boolean; createdAt: string;
}

export interface Certification { id: string; name: string; agency?: string | null; certNumber?: string | null; issuedOn?: string | null; status: 'in_progress' | 'issued' }
export interface DiveLog { id: string; doveOn: string; site: string; maxDepthFt?: number | null; durationMin?: number | null; notes: string }
export interface Document { id: string; userId: string; key: string; name: string; mime: string; size: number; kind: 'waiver' | 'medical' | 'certification' | 'other'; createdAt: string }

export interface ContentField {
  section: string; key: string; label: string; type: 'text' | 'textarea' | 'markdown' | 'image' | 'list' | 'icon';
  default: any; itemFields?: { key: string; label: string; type: string }[];
}
export type ContentValues = Record<string, any>;

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  class: 'Class', dive_trip: 'Dive Trip', training_dive: 'Training Dive', pool_session: 'Pool Session', other: 'Event',
};
export const POST_CATEGORY_LABEL: Record<PostCategory, string> = {
  news: 'News', training_tips: 'Training Tips', trip_reports: 'Trip Reports', equipment: 'Equipment', videos: 'Videos',
};
export const ALBUM_LABEL: Record<Album, string> = { classes: 'Classes', dive_sites: 'Dive Sites', travel: 'Travel', videos: 'Videos', other: 'Other' };
export const LEVEL_LABEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', technical: 'Technical', professional: 'Professional' };
export const CATEGORY_LABEL: Record<string, string> = { recreational: 'Recreational', technical: 'Technical', specialty: 'Specialty', professional: 'Professional' };
