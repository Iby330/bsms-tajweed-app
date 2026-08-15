export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          auto_marks: number | null
          auto_rubric: Json | null
          final_marks: number | null
          id: string
          question_id: string
          response: Json
          submission_id: string
          teacher_comment: string | null
        }
        Insert: {
          auto_marks?: number | null
          auto_rubric?: Json | null
          final_marks?: number | null
          id?: string
          question_id: string
          response: Json
          submission_id: string
          teacher_comment?: string | null
        }
        Update: {
          auto_marks?: number | null
          auto_rubric?: Json | null
          final_marks?: number | null
          id?: string
          question_id?: string
          response?: Json
          submission_id?: string
          teacher_comment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          absence_reason: string | null
          class_id: string
          id: string
          present: boolean
          recorded_by: string | null
          session_date: string
          session_type: Database["public"]["Enums"]["session_t"]
          strike_id: string | null
          student_id: string
        }
        Insert: {
          absence_reason?: string | null
          class_id: string
          id?: string
          present: boolean
          recorded_by?: string | null
          session_date: string
          session_type: Database["public"]["Enums"]["session_t"]
          strike_id?: string | null
          student_id: string
        }
        Update: {
          absence_reason?: string | null
          class_id?: string
          id?: string
          present?: boolean
          recorded_by?: string | null
          session_date?: string
          session_type?: Database["public"]["Enums"]["session_t"]
          strike_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_strike_id_fkey"
            columns: ["strike_id"]
            isOneToOne: false
            referencedRelation: "strikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          id: string
          name: string
          section: Database["public"]["Enums"]["section_t"]
          teacher_id: string | null
        }
        Insert: {
          id?: string
          name: string
          section: Database["public"]["Enums"]["section_t"]
          teacher_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          section?: Database["public"]["Enums"]["section_t"]
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_teacher_fk"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_scores: {
        Row: {
          entered_at: string | null
          entered_by: string | null
          score: number
          student_id: string
          term_id: number
        }
        Insert: {
          entered_at?: string | null
          entered_by?: string | null
          score: number
          student_id: string
          term_id: number
        }
        Update: {
          entered_at?: string | null
          entered_by?: string | null
          score?: number
          student_id?: string
          term_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_scores_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_scores_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      hifz_profiles: {
        Row: {
          is_custom: boolean
          start_surah: number
          student_id: string
          target_count: number
        }
        Insert: {
          is_custom?: boolean
          start_surah?: number
          student_id: string
          target_count: number
        }
        Update: {
          is_custom?: boolean
          start_surah?: number
          student_id?: string
          target_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "hifz_profiles_start_surah_fkey"
            columns: ["start_surah"]
            isOneToOne: false
            referencedRelation: "surahs"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "hifz_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hifz_records: {
        Row: {
          marked_by: string | null
          passed_at: string
          student_id: string
          surah_number: number
          teacher_comment: string | null
        }
        Insert: {
          marked_by?: string | null
          passed_at?: string
          student_id: string
          surah_number: number
          teacher_comment?: string | null
        }
        Update: {
          marked_by?: string | null
          passed_at?: string
          student_id?: string
          surah_number?: number
          teacher_comment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hifz_records_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hifz_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hifz_records_surah_number_fkey"
            columns: ["surah_number"]
            isOneToOne: false
            referencedRelation: "surahs"
            referencedColumns: ["number"]
          },
        ]
      }
      homeworks: {
        Row: {
          due_at: string | null
          id: string
          is_graded: boolean
          number: number
          series: Database["public"]["Enums"]["series_t"]
          title: string
          total_marks: number
          week_id: string
        }
        Insert: {
          due_at?: string | null
          id?: string
          is_graded?: boolean
          number: number
          series?: Database["public"]["Enums"]["series_t"]
          title: string
          total_marks: number
          week_id: string
        }
        Update: {
          due_at?: string | null
          id?: string
          is_graded?: boolean
          number?: number
          series?: Database["public"]["Enums"]["series_t"]
          title?: string
          total_marks?: number
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homeworks_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_watches: {
        Row: {
          lesson_id: string
          student_id: string
          watched_at: string | null
        }
        Insert: {
          lesson_id: string
          student_id: string
          watched_at?: string | null
        }
        Update: {
          lesson_id?: string
          student_id?: string
          watched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_watches_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_watches_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          id: string
          position: number
          series: Database["public"]["Enums"]["series_t"]
          title: string
          week_id: string
          youtube_id: string | null
        }
        Insert: {
          id?: string
          position?: number
          series: Database["public"]["Enums"]["series_t"]
          title: string
          week_id: string
          youtube_id?: string | null
        }
        Update: {
          id?: string
          position?: number
          series?: Database["public"]["Enums"]["series_t"]
          title?: string
          week_id?: string
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          class_id: string | null
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          section: Database["public"]["Enums"]["section_t"]
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          full_name: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          section: Database["public"]["Enums"]["section_t"]
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          section?: Database["public"]["Enums"]["section_t"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          homework_id: string
          id: string
          is_bonus: boolean
          is_task: boolean
          needs_key: boolean
          options: Json | null
          points: number
          position: number
          prompt: string
          qtype: Database["public"]["Enums"]["qtype_t"]
          rubric: Json | null
          scoring: Database["public"]["Enums"]["scoring_t"]
        }
        Insert: {
          homework_id: string
          id?: string
          is_bonus?: boolean
          is_task?: boolean
          needs_key?: boolean
          options?: Json | null
          points?: number
          position: number
          prompt: string
          qtype: Database["public"]["Enums"]["qtype_t"]
          rubric?: Json | null
          scoring?: Database["public"]["Enums"]["scoring_t"]
        }
        Update: {
          homework_id?: string
          id?: string
          is_bonus?: boolean
          is_task?: boolean
          needs_key?: boolean
          options?: Json | null
          points?: number
          position?: number
          prompt?: string
          qtype?: Database["public"]["Enums"]["qtype_t"]
          rubric?: Json | null
          scoring?: Database["public"]["Enums"]["scoring_t"]
        }
        Relationships: [
          {
            foreignKeyName: "questions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homeworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "v_hw_pct"
            referencedColumns: ["homework_id"]
          },
          {
            foreignKeyName: "questions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "v_hw_pct_all"
            referencedColumns: ["homework_id"]
          },
        ]
      }
      quran_words: {
        Row: {
          ayah_number: number
          is_end: boolean
          line_number: number
          page_number: number
          surah_number: number
          text_uthmani: string
          word_position: number
        }
        Insert: {
          ayah_number: number
          is_end?: boolean
          line_number: number
          page_number: number
          surah_number: number
          text_uthmani: string
          word_position: number
        }
        Update: {
          ayah_number?: number
          is_end?: boolean
          line_number?: number
          page_number?: number
          surah_number?: number
          text_uthmani?: string
          word_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "quran_words_surah_number_fkey"
            columns: ["surah_number"]
            isOneToOne: false
            referencedRelation: "surahs"
            referencedColumns: ["number"]
          },
        ]
      }
      revision_mistakes: {
        Row: {
          ayah_number: number
          category: string
          created_at: string
          detail: string | null
          id: string
          note: string | null
          session_id: string
          surah_number: number
          word_position: number
        }
        Insert: {
          ayah_number: number
          category: string
          created_at?: string
          detail?: string | null
          id?: string
          note?: string | null
          session_id: string
          surah_number: number
          word_position: number
        }
        Update: {
          ayah_number?: number
          category?: string
          created_at?: string
          detail?: string | null
          id?: string
          note?: string | null
          session_id?: string
          surah_number?: number
          word_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "revision_mistakes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "revision_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_pairs: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string | null
          id: string
          student_a: string
          student_b: string
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          student_a: string
          student_b: string
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          student_a?: string
          student_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "revision_pairs_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_pairs_student_a_fkey"
            columns: ["student_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_pairs_student_b_fkey"
            columns: ["student_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_sessions: {
        Row: {
          flags: string[]
          id: string
          overall_note: string | null
          reciter_id: string
          reviewer_id: string
          started_at: string
          submitted_at: string | null
        }
        Insert: {
          flags?: string[]
          id?: string
          overall_note?: string | null
          reciter_id: string
          reviewer_id: string
          started_at?: string
          submitted_at?: string | null
        }
        Update: {
          flags?: string[]
          id?: string
          overall_note?: string | null
          reciter_id?: string
          reviewer_id?: string
          started_at?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revision_sessions_reciter_id_fkey"
            columns: ["reciter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_sessions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          applied_at: string
          filename: string
        }
        Insert: {
          applied_at?: string
          filename: string
        }
        Update: {
          applied_at?: string
          filename?: string
        }
        Relationships: []
      }
      strikes: {
        Row: {
          id: string
          issued_at: string | null
          issued_by: string
          note: string | null
          reason: Database["public"]["Enums"]["strike_reason"]
          student_id: string
          term_id: number
        }
        Insert: {
          id?: string
          issued_at?: string | null
          issued_by: string
          note?: string | null
          reason: Database["public"]["Enums"]["strike_reason"]
          student_id: string
          term_id: number
        }
        Update: {
          id?: string
          issued_at?: string | null
          issued_by?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["strike_reason"]
          student_id?: string
          term_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "strikes_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strikes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strikes_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          homework_id: string
          id: string
          is_late: boolean
          status: Database["public"]["Enums"]["sub_status"]
          student_id: string
          submitted_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          homework_id: string
          id?: string
          is_late?: boolean
          status?: Database["public"]["Enums"]["sub_status"]
          student_id: string
          submitted_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          homework_id?: string
          id?: string
          is_late?: boolean
          status?: Database["public"]["Enums"]["sub_status"]
          student_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homeworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "v_hw_pct"
            referencedColumns: ["homework_id"]
          },
          {
            foreignKeyName: "submissions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "v_hw_pct_all"
            referencedColumns: ["homework_id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      surahs: {
        Row: {
          name_ar: string
          name_en: string
          number: number
          order_index: number
        }
        Insert: {
          name_ar: string
          name_en: string
          number: number
          order_index: number
        }
        Update: {
          name_ar?: string
          name_en?: string
          number?: number
          order_index?: number
        }
        Relationships: []
      }
      terms: {
        Row: {
          ends_on: string
          exam_max: number
          id: number
          starts_on: string
        }
        Insert: {
          ends_on: string
          exam_max: number
          id: number
          starts_on: string
        }
        Update: {
          ends_on?: string
          exam_max?: number
          id?: number
          starts_on?: string
        }
        Relationships: []
      }
      voice_notes: {
        Row: {
          duration_s: number | null
          id: string
          question_id: string
          storage_path: string
          submission_id: string
        }
        Insert: {
          duration_s?: number | null
          id?: string
          question_id: string
          storage_path: string
          submission_id: string
        }
        Update: {
          duration_s?: number | null
          id?: string
          question_id?: string
          storage_path?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_notes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_notes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      weeks: {
        Row: {
          id: string
          number: number
          term_id: number
          unlock_at: string
        }
        Insert: {
          id?: string
          number: number
          term_id: number
          unlock_at: string
        }
        Update: {
          id?: string
          number?: number
          term_id?: number
          unlock_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weeks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_eoy: {
        Row: {
          eoy_pct: number | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_hifz_progress: {
        Row: {
          passed: number | null
          pct: number | null
          start_surah: number | null
          student_id: string | null
          target_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hifz_profiles_start_surah_fkey"
            columns: ["start_surah"]
            isOneToOne: false
            referencedRelation: "surahs"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "hifz_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_hifz_progress_all: {
        Row: {
          pct: number | null
          student_id: string | null
          target_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hifz_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_hw_pct: {
        Row: {
          homework_id: string | null
          number: number | null
          pct: number | null
          student_id: string | null
          term_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weeks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      v_hw_pct_all: {
        Row: {
          homework_id: string | null
          number: number | null
          pct: number | null
          student_id: string | null
          term_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weeks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lb_class: {
        Row: {
          class_name: string | null
          pct: number | null
          rank: number | null
          section: Database["public"]["Enums"]["section_t"] | null
        }
        Relationships: []
      }
      v_lb_hifz_class: {
        Row: {
          class_name: string | null
          pct: number | null
          rank: number | null
          section: Database["public"]["Enums"]["section_t"] | null
        }
        Relationships: []
      }
      v_lb_hifz_individual: {
        Row: {
          class_name: string | null
          class_rank: number | null
          full_name: string | null
          pct: number | null
          rank: number | null
        }
        Relationships: []
      }
      v_lb_individual: {
        Row: {
          class_name: string | null
          class_rank: number | null
          full_name: string | null
          pct: number | null
          rank: number | null
        }
        Relationships: []
      }
      v_term_pct: {
        Row: {
          student_id: string | null
          term_id: number | null
          term_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weeks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      v_termly_avg: {
        Row: {
          hw_avg: number | null
          student_id: string | null
          term_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weeks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_homework_for_student: { Args: { hw_id: string }; Returns: Json }
      is_teacher: { Args: never; Returns: boolean }
    }
    Enums: {
      qtype_t: "mcq" | "checkbox" | "text" | "paragraph" | "grid"
      scoring_t: "exact" | "per_option" | "manual"
      section_t: "brothers" | "sisters"
      series_t: "tajweed" | "umm_al_kitab" | "tfp" | "seerah"
      session_t: "monday" | "thursday"
      strike_reason: "absence" | "homework" | "conduct"
      sub_status: "draft" | "submitted" | "auto_marked" | "approved"
      user_role: "student" | "teacher"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      qtype_t: ["mcq", "checkbox", "text", "paragraph", "grid"],
      scoring_t: ["exact", "per_option", "manual"],
      section_t: ["brothers", "sisters"],
      series_t: ["tajweed", "umm_al_kitab", "tfp", "seerah"],
      session_t: ["monday", "thursday"],
      strike_reason: ["absence", "homework", "conduct"],
      sub_status: ["draft", "submitted", "auto_marked", "approved"],
      user_role: ["student", "teacher"],
    },
  },
} as const

