// What a new listener can pick on first login. A FIXED list (English names, as the providers spell them): the app never stores free text here.
// Add or remove names freely; people who picked a name that is later removed simply keep it harmlessly (it is only a search seed).

export const ARTIST_OPTIONS = [
  'Sid Sriram', 'Shreya Ghoshal', 'S. P. Balasubrahmanyam', 'K. J. Yesudas', 'Chinmayi', 'Karthik', 'Hariharan', 'S. Janaki',
  'K. S. Chithra', 'Haricharan', 'Vijay Prakash', 'Benny Dayal', 'Andrea Jeremiah', 'Dhanush', 'Anirudh Ravichander', 'Yuvan Shankar Raja',
  'Jonita Gandhi', 'Pradeep Kumar', 'Swetha Mohan', 'Unni Menon', 'Mano', 'T. M. Soundararajan', 'P. Susheela', 'Vijay Yesudas',
];

export const COMPOSER_OPTIONS = [
  'Ilaiyaraaja', 'A. R. Rahman', 'Yuvan Shankar Raja', 'Anirudh Ravichander', 'Harris Jayaraj', 'D. Imman', 'G. V. Prakash Kumar', 'Santhosh Narayanan',
  'Sam C. S.', 'Vidyasagar', 'Deva', 'M. S. Viswanathan', 'Hiphop Tamizha', 'Devi Sri Prasad', 'Sean Roldan', 'Ghibran',
];

export const ERA_OPTIONS = [
  { id: 'before-1990', label: 'Before 1990' },
  { id: '90s', label: '90s' },
  { id: '2000s', label: '2000s' },
  { id: '2010s', label: '2010s' },
  { id: '2020s', label: '2020s' },
];

export const TASTE_LIMITS = { artists: 12, composers: 8, eras: 5 };
export const eraIds = () => ERA_OPTIONS.map((e) => e.id);
