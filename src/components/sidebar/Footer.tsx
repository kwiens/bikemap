export function Footer() {
  return (
    <div className="border-t border-gray-200 p-3 text-xs text-center text-gray-500 [&_p]:m-0 [&_p+p]:mt-1">
      <h4 className="text-sm font-medium mb-2">Get Out and Have Fun</h4>
      <p>
        Pedal your way through Chattanooga&apos;s best spots—feel the river
        breeze, roll up to the Zoo for an up-close animal encounter, explore the
        Aquarium&apos;s underwater wonders, and step back in time at the
        Railroad Museum. Grab your bike, gather friends, and enjoy the ride!
      </p>
      <p>© {new Date().getFullYear()} BikeMap</p>
    </div>
  );
}
