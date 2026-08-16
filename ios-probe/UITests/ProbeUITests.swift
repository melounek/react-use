import XCTest

/// Drives the app the way a person would and attaches a screenshot after each
/// step, so the run's artifacts show what the UI actually looked like.
final class ProbeUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func snap(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    func testTapsRegisterOnTheBoard() throws {
        let app = XCUIApplication()
        app.launch()

        let counter = app.staticTexts["tapCounter"]
        XCTAssertTrue(counter.waitForExistence(timeout: 20), "app did not reach its first screen")
        XCTAssertEqual(counter.label, "iOS probe — tapped 0×")
        snap(app, "01-launch")

        // The squares surface as StaticText, not otherElements — the UI
        // hierarchy dump attached to the first run showed the real element type.
        // e2 in this layout is index 52, e4 is index 36.
        app.staticTexts["sq-52"].firstMatch.tap()
        snap(app, "02-selected-e2")
        XCTAssertEqual(counter.label, "iOS probe — tapped 1×")

        app.staticTexts["sq-36"].firstMatch.tap()
        snap(app, "03-selected-e4")
        XCTAssertEqual(counter.label, "iOS probe — tapped 2×")
    }
}
