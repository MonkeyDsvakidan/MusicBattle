alter table public.mb_draft_picks drop constraint if exists mb_draft_picks_round_number_check;
alter table public.mb_draft_picks add constraint mb_draft_picks_round_number_check check (round_number between 1 and 6);
