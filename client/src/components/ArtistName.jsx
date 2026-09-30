function ArtistName({ value, onChange, isLoggedIn }) {
  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Enter Your Artist Name..."
        value={value}
        disabled={!isLoggedIn}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-full border-2 border-black px-5 text-sm outline-none placeholder:text-[#666666] disabled:cursor-not-allowed disabled:bg-[#f3f3f3]"
      />

      {!isLoggedIn && (
        <p className="px-5 text-xs text-[#666666]">
          Sign in to customize your Artist Name.
        </p>
      )}
    </div>
  );
}

export default ArtistName;
