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

			if (typeof page.route == "function") {

				page.route(location.hash.substring(1));
			}
			else {

				page.route = location.hash.substring(1);
			}
		};

		if (typeof page.route == "function") {

			this.route = Update(function() {

				location.hash = page.route();
			});
		}
		else {

			this.route = Update(function() {

				location.hash = page.route;
			});
		}

		if (typeof page.route == "function") {

			window.addEventListener("hashchange", function() {

				page.route(location.hash.substring(1));
			});
		}
		else {

			window.addEventListener("hashchange", function() {

				page.route = location.hash.substring(1);
			});
		}
	}

	return RouterPiece;
});
