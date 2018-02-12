define([], function RouterPiece() {

	function RouterPiece(page) {

		this.page = page;

		this.onBind = function(element) {

			var route = document.createElement("DIV");
			route.dataset.bind = "route";
			route.style.display = "none";

			var container = document.createElement("DIV");
			container.dataset.bind = "page";

			element.appendChild(route);
			element.appendChild(container);

			page.route(location.hash.substring(1));
		};

		this.route = Update(function() {

			location.hash = page.route();
		});

		window.addEventListener("hashchange", function() {

			page.route(location.hash.substring(1));
		});
	}

	return RouterPiece;
});
