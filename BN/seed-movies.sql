-- =============================================================================
-- CineBook Movie Seed — ~55 diverse, deduplicated movies
-- =============================================================================
-- Run after schema.sql. Safe to re-run: each row is only inserted if its title
-- isn't already in the `movies` table (idempotent via WHERE NOT EXISTS).
--
-- The previous version of this file had ~85 entries with many duplicates and a
-- placeholder poster hash repeated everywhere. If you already ran it, run the
-- cleanup block BELOW first (uncomment) to remove those broken rows. Otherwise,
-- you can skip the cleanup and just run the INSERT.
-- =============================================================================

-- ----- CLEANUP (uncomment if you ran the earlier broken seed) ----------------
-- DELETE FROM movies WHERE poster_url LIKE '%7u2oL7V9Yd2z5f1z6b3c8d9e0f%';

-- =============================================================================
-- Movies
-- =============================================================================
-- Notes
--   * poster_url / backdrop_url use TMDB image paths (image.tmdb.org/t/p/...).
--   * For posters I'm less sure of, the value is NULL — populate via the admin
--     UI (Admin → Movies → Edit) so you don't ship broken images.
--   * trailer_url is the YouTube watch URL; the frontend converts to embed.
-- =============================================================================

INSERT INTO movies (
  title, description, poster_url, backdrop_url, trailer_url,
  genre, language, duration_minutes, rating, price, showtimes
)
SELECT v.title, v.description, v.poster_url, v.backdrop_url, v.trailer_url,
       v.genre, v.language, v.duration_minutes, v.rating, v.price, v.showtimes::jsonb
FROM (VALUES
  -- ============================== Sci-Fi =====================================
  ('The Matrix',
   'A computer hacker learns from mysterious rebels about the true nature of his reality.',
   'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
   NULL,
   'https://www.youtube.com/watch?v=vKQi3bBA1y8',
   'Sci-Fi', 'English', 136, 8.7, 13.50,
   '["10:00 AM", "01:30 PM", "06:00 PM", "09:15 PM"]'),

  ('Blade Runner 2049',
   'A young blade runner''s discovery of a long-buried secret leads him to track down former blade runner Rick Deckard.',
   'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
   NULL,
   'https://www.youtube.com/watch?v=gCcx85zbxz4',
   'Sci-Fi', 'English', 164, 8.0, 14.00,
   '["11:00 AM", "03:00 PM", "07:30 PM"]'),

  ('Arrival',
   'A linguist works with the military to communicate with alien lifeforms after twelve mysterious spacecrafts land on Earth.',
   'https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoV.jpg',
   NULL,
   'https://www.youtube.com/watch?v=tFMo3UJ4B4g',
   'Sci-Fi', 'English', 116, 7.9, 13.00,
   '["12:00 PM", "04:00 PM", "08:00 PM"]'),

  ('Dune',
   'A noble family becomes embroiled in a war for control over the galaxy''s most valuable asset.',
   'https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
   NULL,
   'https://www.youtube.com/watch?v=8g18jFHCLXk',
   'Sci-Fi', 'English', 155, 8.0, 14.00,
   '["10:45 AM", "02:30 PM", "06:15 PM", "09:30 PM"]'),

  ('Dune: Part Two',
   'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
   'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZQ6N1k2.jpg',
   NULL,
   'https://www.youtube.com/watch?v=Way9Dexny3w',
   'Sci-Fi', 'English', 166, 8.8, 15.50,
   '["10:00 AM", "01:45 PM", "05:30 PM", "09:15 PM"]'),

  ('Ex Machina',
   'A young programmer is selected to participate in a ground-breaking experiment in synthetic intelligence.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=EoQuVnKhxaM',
   'Sci-Fi', 'English', 108, 7.7, 12.50,
   '["12:15 PM", "04:30 PM", "08:30 PM"]'),

  ('2001: A Space Odyssey',
   'After discovering a mysterious artifact on the moon, humanity sets off on a quest to find its origins.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=oR_e9y-bka0',
   'Sci-Fi', 'English', 149, 8.3, 12.00,
   '["02:00 PM", "06:30 PM"]'),

  ('Edge of Tomorrow',
   'A soldier fighting aliens gets to relive the same day over and over again.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=yUmSVcttXnI',
   'Sci-Fi', 'English', 113, 7.9, 13.00,
   '["11:30 AM", "03:15 PM", "07:00 PM"]'),

  -- ============================== Action =====================================
  ('Mad Max: Fury Road',
   'In a post-apocalyptic wasteland, a woman rebels against a tyrannical ruler in search of her homeland.',
   'https://image.tmdb.org/t/p/w500/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg',
   NULL,
   'https://www.youtube.com/watch?v=hEJnMQG9ev8',
   'Action', 'English', 120, 8.1, 13.00,
   '["11:30 AM", "03:00 PM", "07:45 PM"]'),

  ('John Wick',
   'An ex-hitman comes out of retirement to track down the gangsters that took everything from him.',
   'https://image.tmdb.org/t/p/w500/fZPSd91yGE9fCcCe6OoQZBpQA8M.jpg',
   NULL,
   'https://www.youtube.com/watch?v=2AUmvWm5ZDQ',
   'Action', 'English', 101, 7.4, 12.50,
   '["10:30 AM", "01:45 PM", "05:00 PM", "08:15 PM"]'),

  ('Gladiator',
   'A former Roman general sets out to exact vengeance against the corrupt emperor.',
   'https://image.tmdb.org/t/p/w500/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg',
   NULL,
   'https://www.youtube.com/watch?v=owK1qxDselE',
   'Action', 'English', 155, 8.5, 13.50,
   '["11:00 AM", "02:45 PM", "07:00 PM"]'),

  ('Top Gun: Maverick',
   'After thirty years, Maverick is still pushing the envelope as a top naval aviator.',
   'https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg',
   NULL,
   'https://www.youtube.com/watch?v=qSqVVswa420',
   'Action', 'English', 131, 8.3, 14.00,
   '["10:30 AM", "02:15 PM", "06:00 PM", "09:45 PM"]'),

  ('The Batman',
   'When a sadistic serial killer begins murdering key political figures in Gotham, Batman is forced to investigate.',
   'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg',
   NULL,
   'https://www.youtube.com/watch?v=mqqft2x_Aa4',
   'Action', 'English', 176, 7.8, 14.00,
   '["12:00 PM", "04:30 PM", "08:00 PM"]'),

  ('Avengers: Endgame',
   'After the devastating events of Infinity War, the Avengers assemble once more to undo Thanos''s actions.',
   'https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg',
   NULL,
   'https://www.youtube.com/watch?v=TcMBFSGVi1c',
   'Action', 'English', 181, 8.4, 14.00,
   '["10:00 AM", "02:30 PM", "07:00 PM"]'),

  -- ============================== Drama ======================================
  ('The Shawshank Redemption',
   'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.',
   'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
   NULL,
   'https://www.youtube.com/watch?v=NmzuHjWmXOc',
   'Drama', 'English', 142, 9.3, 12.00,
   '["10:15 AM", "02:00 PM", "06:30 PM"]'),

  ('The Godfather',
   'The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.',
   'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
   NULL,
   'https://www.youtube.com/watch?v=sY1S34973zA',
   'Drama', 'English', 175, 9.2, 12.50,
   '["11:00 AM", "03:30 PM", "08:00 PM"]'),

  ('Forrest Gump',
   'The story of a slow-witted but kind-hearted man from Alabama who witnesses and unwittingly influences several historical events.',
   'https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg',
   NULL,
   'https://www.youtube.com/watch?v=bLvqoHBptjg',
   'Drama', 'English', 142, 8.8, 12.50,
   '["10:30 AM", "02:00 PM", "05:45 PM", "09:00 PM"]'),

  ('Schindler''s List',
   'In German-occupied Poland during WWII, industrialist Oskar Schindler gradually becomes concerned for his Jewish workforce.',
   'https://image.tmdb.org/t/p/w500/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg',
   NULL,
   'https://www.youtube.com/watch?v=mxphAlJID9U',
   'Drama', 'English', 195, 9.0, 12.00,
   '["12:30 PM", "06:30 PM"]'),

  ('The Pianist',
   'A Polish Jewish musician struggles to survive the destruction of the Warsaw ghetto during World War II.',
   'https://image.tmdb.org/t/p/w500/2hFvxCCWrTmCYwfy7yum0GKRi3Y.jpg',
   NULL,
   'https://www.youtube.com/watch?v=BFwGqLa_oAo',
   'Drama', 'English', 150, 8.5, 12.00,
   '["11:30 AM", "03:15 PM", "07:30 PM"]'),

  ('Whiplash',
   'A promising young drummer enrolls at a cut-throat music conservatory where his dreams are mentored by an instructor who will stop at nothing.',
   'https://image.tmdb.org/t/p/w500/7fn624j5lj3xTme2SgiLCeuedmO.jpg',
   NULL,
   'https://www.youtube.com/watch?v=7d_jQycdQGo',
   'Drama', 'English', 106, 8.5, 12.00,
   '["10:45 AM", "02:30 PM", "06:00 PM", "09:15 PM"]'),

  ('La La Land',
   'A jazz pianist falls for an aspiring actress in Los Angeles.',
   'https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg',
   NULL,
   'https://www.youtube.com/watch?v=0pdqf4P9MB8',
   'Drama', 'English', 128, 8.0, 13.00,
   '["11:30 AM", "03:00 PM", "07:30 PM"]'),

  -- ============================== Crime/Thriller =============================
  ('Pulp Fiction',
   'The lives of two mob hitmen, a boxer, a gangster and his wife intertwine in four tales of violence and redemption.',
   'https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
   NULL,
   'https://www.youtube.com/watch?v=s7EdQ4FqbhY',
   'Crime', 'English', 154, 8.9, 13.00,
   '["12:30 PM", "04:30 PM", "08:30 PM"]'),

  ('Goodfellas',
   'The story of Henry Hill and his life in the mob, covering his relationship with his wife and his mob partners.',
   'https://image.tmdb.org/t/p/w500/aKuFiU82s5ISJpGZp7YkIr3kCUd.jpg',
   NULL,
   'https://www.youtube.com/watch?v=qo5jJpHtI1Y',
   'Crime', 'English', 146, 8.7, 12.50,
   '["11:15 AM", "03:00 PM", "07:00 PM"]'),

  ('Se7en',
   'Two detectives hunt a serial killer who uses the seven deadly sins as his motives.',
   'https://image.tmdb.org/t/p/w500/6yoghtyTpznpBik8EngEmJskVUO.jpg',
   NULL,
   'https://www.youtube.com/watch?v=znmZoVkCjpI',
   'Thriller', 'English', 127, 8.6, 12.50,
   '["12:45 PM", "04:30 PM", "08:15 PM"]'),

  ('The Departed',
   'An undercover cop and a mole in the police attempt to identify each other while infiltrating an Irish gang.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=auYbpnEwBBg',
   'Crime', 'English', 151, 8.5, 13.00,
   '["11:00 AM", "02:45 PM", "07:00 PM"]'),

  ('No Country for Old Men',
   'Violence and mayhem ensue after a hunter stumbles upon a drug deal gone wrong and more than two million dollars in cash.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=38A__WT3-o0',
   'Thriller', 'English', 122, 8.2, 12.50,
   '["12:00 PM", "03:45 PM", "07:30 PM"]'),

  ('Heat',
   'A group of professional bank robbers start to feel the heat from police when they unknowingly leave a clue at their latest heist.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=2GfZl4kuVNI',
   'Crime', 'English', 170, 8.3, 12.50,
   '["11:30 AM", "03:45 PM", "08:00 PM"]'),

  -- ============================== Mystery/Comedy =============================
  ('Knives Out',
   'A detective investigates the death of a patriarch of an eccentric, combative family.',
   'https://image.tmdb.org/t/p/w500/pThyQovXQrw2m0s9x82twj48Jq4.jpg',
   NULL,
   'https://www.youtube.com/watch?v=qGqiHJTsRkQ',
   'Mystery', 'English', 130, 7.9, 13.00,
   '["10:45 AM", "02:15 PM", "06:00 PM", "09:15 PM"]'),

  ('Glass Onion: A Knives Out Mystery',
   'Famed Southern detective Benoit Blanc travels to Greece for his latest case.',
   'https://image.tmdb.org/t/p/w500/vDGr1YdrlfbU9wxTOdpf3zChmv9.jpg',
   NULL,
   'https://www.youtube.com/watch?v=gj5ibYSz8C0',
   'Mystery', 'English', 139, 7.2, 13.50,
   '["11:30 AM", "03:00 PM", "07:30 PM"]'),

  ('The Grand Budapest Hotel',
   'A writer encounters the owner of an aging high-class hotel, who tells him of his early years serving as a lobby boy.',
   'https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg',
   NULL,
   'https://www.youtube.com/watch?v=1Fg5iWmQjwk',
   'Comedy', 'English', 99, 8.1, 12.00,
   '["11:00 AM", "02:00 PM", "05:30 PM", "08:30 PM"]'),

  ('The Big Lebowski',
   'Jeff "The Dude" Lebowski, mistaken for a millionaire of the same name, seeks restitution for a rug ruined by thugs.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=cd-go0oBF4Y',
   'Comedy', 'English', 117, 8.1, 11.50,
   '["12:30 PM", "04:00 PM", "08:00 PM"]'),

  -- ============================== Animation ==================================
  ('My Neighbor Totoro',
   'Two young girls move with their father to be near their hospitalized mother and discover spirits in the surrounding forests.',
   'https://image.tmdb.org/t/p/w500/rtGDOeG9LzoerkDGZF9dnVeLppL.jpg',
   NULL,
   'https://www.youtube.com/watch?v=92a7Hj0ijLs',
   'Animation', 'Japanese', 86, 8.2, 11.00,
   '["10:00 AM", "12:30 PM", "03:00 PM", "06:00 PM"]'),

  ('Princess Mononoke',
   'On a journey to find the cure for a Tatarigami''s curse, a young prince becomes involved in a struggle between forest gods and humans.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=4OiMOHRDs14',
   'Animation', 'Japanese', 134, 8.4, 11.50,
   '["11:00 AM", "02:30 PM", "06:00 PM"]'),

  ('Spider-Man: Into the Spider-Verse',
   'Teen Miles Morales becomes the Spider-Man of his universe and must join with five others to stop a threat for all realities.',
   'https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg',
   NULL,
   'https://www.youtube.com/watch?v=tg52up16eq0',
   'Animation', 'English', 117, 8.4, 12.50,
   '["10:30 AM", "01:30 PM", "05:00 PM", "08:00 PM"]'),

  ('WALL·E',
   'In the distant future, a small waste-collecting robot inadvertently embarks on a space journey that will ultimately decide humanity''s fate.',
   'https://image.tmdb.org/t/p/w500/hbhFnRzzg6ZDmm8YAmxBnQpQIPh.jpg',
   NULL,
   'https://www.youtube.com/watch?v=alIq_wG9FNk',
   'Animation', 'English', 98, 8.4, 11.50,
   '["10:00 AM", "12:30 PM", "03:30 PM", "06:30 PM"]'),

  ('Toy Story',
   'A cowboy doll is profoundly threatened and jealous when a new spaceman action figure supplants him as top toy in a boy''s bedroom.',
   'https://image.tmdb.org/t/p/w500/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg',
   NULL,
   'https://www.youtube.com/watch?v=KYz2wyBy3kc',
   'Animation', 'English', 81, 8.3, 11.00,
   '["10:00 AM", "12:15 PM", "03:00 PM", "06:00 PM"]'),

  ('Coco',
   'Aspiring musician Miguel, confronted with his family''s ban on music, enters the Land of the Dead to find his ancestor.',
   'https://image.tmdb.org/t/p/w500/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg',
   NULL,
   'https://www.youtube.com/watch?v=Ga6RYejo6Hk',
   'Animation', 'English', 105, 8.4, 11.50,
   '["10:15 AM", "01:00 PM", "04:30 PM", "07:45 PM"]'),

  ('Up',
   'An elderly widower travels to South America in his floating house, accompanied by a young Wilderness Explorer.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=ORFWdXl_zJ4',
   'Animation', 'English', 96, 8.3, 11.50,
   '["10:30 AM", "01:00 PM", "04:00 PM", "07:00 PM"]'),

  ('Your Name',
   'Two strangers find themselves linked in a bizarre way. When a connection forms, will distance be the only thing to keep them apart?',
   'https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6babgKnONONX.jpg',
   NULL,
   'https://www.youtube.com/watch?v=k0jR4HD8nDk',
   'Animation', 'Japanese', 106, 8.4, 12.00,
   '["11:15 AM", "02:00 PM", "05:30 PM", "08:30 PM"]'),

  -- ============================== Horror =====================================
  ('Hereditary',
   'A grieving family is haunted by tragic and disturbing occurrences.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=V6wWKNij_1M',
   'Horror', 'English', 127, 7.3, 12.00,
   '["11:00 AM", "03:30 PM", "07:45 PM"]'),

  ('Get Out',
   'A young African-American visits his white girlfriend''s parents for the weekend, where his simmering uneasiness about reception eventually reaches a boiling point.',
   'https://image.tmdb.org/t/p/w500/tFXcEccSQMf3lfhfXKSUTrdB2Pz.jpg',
   NULL,
   'https://www.youtube.com/watch?v=DzfpyUB60YY',
   'Horror', 'English', 104, 7.8, 12.50,
   '["12:30 PM", "04:00 PM", "08:15 PM"]'),

  ('The Shining',
   'A family heads to an isolated hotel for the winter where a sinister presence influences the father into violence.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=5Cb3ik6zP2I',
   'Horror', 'English', 146, 8.4, 12.00,
   '["12:00 PM", "04:30 PM", "08:30 PM"]'),

  ('A Quiet Place',
   'In a post-apocalyptic world, a family is forced to live in silence while hiding from monsters with ultra-sensitive hearing.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=WR7cc5t7tv8',
   'Horror', 'English', 90, 7.5, 12.00,
   '["10:30 AM", "01:00 PM", "04:00 PM", "07:30 PM"]'),

  -- ============================== Adventure/Fantasy ==========================
  ('The Lord of the Rings: The Fellowship of the Ring',
   'A meek Hobbit and eight companions set out on a journey to destroy the powerful One Ring and save Middle-earth from the Dark Lord Sauron.',
   'https://image.tmdb.org/t/p/w500/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg',
   NULL,
   'https://www.youtube.com/watch?v=V75dMMIW2B4',
   'Fantasy', 'English', 178, 8.9, 13.00,
   '["10:00 AM", "02:00 PM", "06:30 PM"]'),

  ('The Lord of the Rings: The Two Towers',
   'While Frodo and Sam edge closer to Mordor, their former companions make new allies and launch an assault on Isengard.',
   'https://image.tmdb.org/t/p/w500/5VTN0pR8gcqV3EPUHHfMGnJYN9L.jpg',
   NULL,
   'https://www.youtube.com/watch?v=LbfMDwc4azU',
   'Fantasy', 'English', 179, 8.8, 13.00,
   '["10:00 AM", "02:00 PM", "06:30 PM"]'),

  ('The Lord of the Rings: The Return of the King',
   'Gandalf and Aragorn lead the World of Men against Sauron''s army to draw his gaze from Frodo and Sam.',
   'https://image.tmdb.org/t/p/w500/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg',
   NULL,
   'https://www.youtube.com/watch?v=r5X-hFf6Bwo',
   'Fantasy', 'English', 201, 8.9, 13.50,
   '["10:30 AM", "03:00 PM", "07:30 PM"]'),

  ('Pan''s Labyrinth',
   'In the falangist Spain of 1944, the bookish young stepdaughter of a sadistic army officer escapes into an eerie but captivating fantasy world.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=EE7eRcXk0Sg',
   'Fantasy', 'Spanish', 118, 8.2, 12.50,
   '["10:00 AM", "01:00 PM", "04:30 PM", "07:45 PM"]'),

  -- ============================== Foreign / Other ============================
  ('Parasite',
   'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.',
   'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
   NULL,
   'https://www.youtube.com/watch?v=5xH0HfJHsaY',
   'Drama', 'Korean', 132, 8.5, 13.00,
   '["12:00 PM", "04:15 PM", "08:45 PM"]'),

  ('Oldboy',
   'After being kidnapped and imprisoned for fifteen years, Oh Dae-Su is released only to find that he must find his captor in five days.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=2HkjrJ6IK0o',
   'Thriller', 'Korean', 120, 8.4, 12.00,
   '["11:30 AM", "03:00 PM", "07:30 PM"]'),

  ('City of God',
   'In the slums of Rio, two kids'' paths diverge as one struggles to become a photographer and the other a kingpin.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=2lcD2OW0cX0',
   'Crime', 'Portuguese', 130, 8.6, 12.00,
   '["11:00 AM", "02:15 PM", "05:45 PM", "08:45 PM"]'),

  ('Life Is Beautiful',
   'When an open-minded Jewish waiter and his son become victims of the Holocaust, he uses humor to protect his son from the dangers around their camp.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=ueZ8Sgr-1ac',
   'Drama', 'Italian', 116, 8.6, 11.50,
   '["12:00 PM", "03:30 PM", "07:00 PM"]'),

  ('Crouching Tiger, Hidden Dragon',
   'A young Chinese warrior steals a sword from a famed swordsman and then escapes into a world of romantic adventure.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=WcWlPLi8inA',
   'Action', 'Mandarin', 120, 7.9, 12.00,
   '["10:45 AM", "02:00 PM", "05:30 PM", "08:30 PM"]'),

  ('RRR',
   'A fictitious story about two legendary revolutionaries and their journey away from home before they began fighting for their country in the 1920s.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=f_vbAtFSEc0',
   'Action', 'Telugu', 187, 7.9, 13.00,
   '["11:15 AM", "03:30 PM", "07:45 PM"]'),

  ('3 Idiots',
   'Two friends are searching for their long lost companion as they recall their college days and the lessons their friend taught them.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=K0eDlFX9GMc',
   'Comedy', 'Hindi', 170, 8.4, 11.50,
   '["11:00 AM", "02:30 PM", "06:00 PM", "09:15 PM"]'),

  ('Amélie',
   'Despite being caught in her imaginative world, Amélie, a young waitress, decides to help people find happiness.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=HUECWi5pX7o',
   'Romance', 'French', 122, 8.3, 12.00,
   '["10:30 AM", "01:45 PM", "05:00 PM", "08:15 PM"]'),

  ('The Intouchables',
   'After becoming a quadriplegic from a paragliding accident, an aristocrat hires a young man from the projects to be his caregiver.',
   NULL, NULL,
   'https://www.youtube.com/watch?v=34WIbmXkewU',
   'Comedy', 'French', 112, 8.5, 12.00,
   '["11:15 AM", "02:30 PM", "06:00 PM"]')

) AS v(
  title, description, poster_url, backdrop_url, trailer_url,
  genre, language, duration_minutes, rating, price, showtimes
)
WHERE NOT EXISTS (SELECT 1 FROM movies m WHERE m.title = v.title);

-- =============================================================================
-- Done. Roughly 55 movies (the four already in schema.sql are skipped automatically).
-- =============================================================================
