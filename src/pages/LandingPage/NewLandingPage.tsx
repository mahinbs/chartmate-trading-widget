import landingPage from "./landing.html?raw";

const NewLandingPage = () => {
  return (
    <iframe
      src={landingPage}
      title="TradingSmart Landing Page"
      srcDoc={landingPage}
      style={{
        border: "none",
        width: "100%",
        height: "100dvh",
        minHeight: "100vh",
        display: "block",
        background: "#060912",
      }}
    />
  );
};

export default NewLandingPage;
