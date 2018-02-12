define([], function RouterPiece() {

	function RouterPiece(page) {

		this.page = page;

		this.onBind = function(element) {

			var container = document.createElement("DIV");
			container.dataset.bind = "page";

			element.appendChild(container);

			page.setRoute(location.hash.substring(1));
		};

		window.addEventListener("hashchange", function() {

			page.setRoute(location.hash.substring(1));
		});
	}

	return RouterPiece;
});
