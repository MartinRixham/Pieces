define(["./Route"], function(Route) {

	var route = new Route();

	function ScrollNavPiece(pages) {

		var activeIndex = new Datum(0);

		var container = null;

		var routeIndex = -1;

		this.pages = new Array(pages.length);

		for (var i = 0; i < pages.length; i++) {

			this.pages[i] = pages[i].page;
		}

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			var page = document.createElement("DIV");

			container = document.createElement("DIV");
			container.dataset.bind = "pages";
			container.appendChild(page);

			element.appendChild(container);

			routeIndex =
				route.addRoute({

					set: function(word, routeIndex) {

						routePage(word);
						route.update(routeIndex);
					},
					get: function() {

						return pages[activeIndex()].route;
					}
				});
		};

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					var child = container.children[i];

					if (child) {

						child.scrollIntoView();
					}

					activeIndex(i);

					return;
				}
			}

			activeIndex(0);
		}

		this.showPage = function(index) {

			var child = container.children[index];

			if (child) {

				child.scrollIntoView();
			}

			activeIndex(index);
			route.update(routeIndex);
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return ScrollNavPiece;
});
