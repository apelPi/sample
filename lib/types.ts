export interface Message {
  id?: string;
  chat_id?: string;
  user_id?: string;
  content: string;
  role: "user" | "assistant";
  created_at?: string;
} 