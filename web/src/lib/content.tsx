import { useQuery } from '@tanstack/react-query';
import { get } from './api';
import type { ContentValues } from './types';

interface SiteContent { content: ContentValues; allowSelfRegister: boolean; paymentsEnabled: boolean }

// every editable blurb on the public site, cached for the session
export function useContent() {
  const q = useQuery({ queryKey: ['content'], queryFn: () => get<SiteContent>('/content'), staleTime: 5 * 60_000 });
  const content = q.data?.content || {};
  const c = (key: string, fallback: any = '') => (content[key] ?? fallback) as any;
  return { c, content, allowSelfRegister: q.data?.allowSelfRegister ?? true, paymentsEnabled: q.data?.paymentsEnabled ?? false, loaded: !!q.data };
}
