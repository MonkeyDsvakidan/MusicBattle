-- 1v1-Draft-Start über mb_start_draft (seit M.2 nutzt der 1v1-Client diese RPC statt eines direkten Status-Updates).
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
\set u1 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000001'',false); set role authenticated;'
\set u2 'reset role; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-000000000002'',false); set role authenticated;'
:u1
select 'D01 create', tst.x($$insert into tst.v select 'D', room_id::text from mb_create_room('Ana','auto','two',false)$$);
select 'D02 alone', tst.x($$select mb_start_draft(tst.r('D'))$$);
select 'D02b code', tst.x($$insert into tst.v select 'Dcode', code from mb_rooms where id=tst.r('D')$$);
:u2
select 'D03 join', tst.q($$(select player_slot from mb_join_room((select v from tst.v where k='Dcode'),'Ben','player'))$$);
select 'D04 guest start', tst.x($$select mb_start_draft(tst.r('D'))$$);
:u1
select 'D05 not ready', tst.x($$select mb_start_draft(tst.r('D'))$$);
select 'D06 sp', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('D'),1,true,'a',9)$$);
:u2
select 'D07 sp', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('D'),2,true,'b',9)$$);
:u1
select 'D08 start', tst.x($$select mb_start_draft(tst.r('D'))$$);
select 'D09 room', tst.q($$(select status||' cc'||corner_count from mb_rooms where id=tst.r('D'))$$);
select 'D10 again', tst.x($$select mb_start_draft(tst.r('D'))$$);
select 'D11 turn', tst.q($$tst.turn(tst.r('D'),'draft')$$);
-- Pass & Play
select 'P01 create', tst.x($$insert into tst.v select 'P', room_id::text from mb_create_room('Ana','auto','single',false)$$);
select 'P02 p2', tst.q($$(select player_slot from mb_add_local_player2(tst.r('P'),'Lea'))$$);
select 'P03 sp', tst.x($$select mb_set_spotify_ready_for_slot(tst.r('P'),s,true,'a',9) from generate_series(1,2) s$$);
select 'P04 start', tst.x($$select mb_start_draft(tst.r('P'))$$);
select 'P05 room', tst.q($$(select status||' cc'||corner_count from mb_rooms where id=tst.r('P'))$$);
-- Quiz-Raum
select 'Q01 quiz', tst.x($$insert into tst.v select 'Q', room_id::text from mb_create_quiz_room('Ana','music',10)$$);
select 'Q02 start', tst.x($$select mb_start_draft(tst.r('Q'))$$);
